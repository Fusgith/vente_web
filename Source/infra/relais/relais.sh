#!/usr/bin/env bash
# The OVH relay shared by the shops (T-086, ADR-0008), on a Debian 12 or Ubuntu 24.04 VPS, as root:
#   bash relais.sh installer <adresse IP publique du VPS>   once; rerun: nothing set up is lost
#   bash relais.sh ajouter <domaine du magasin> [e-mails de l'admin et du boss]
#                                                           a shop: prints its tunnel parameters
#   vente-web-relais surveiller                             every minute (systemd timer, T-082)
# Each shop opens an outgoing WireGuard tunnel to here; nginx routes HTTPS by the name asked (SNI)
# to that shop's tunnel without decrypting it, the client's address carried by the PROXY
# protocol. No IP forwarding: a shop never reaches another one. Messages are in French: the
# developer runs this on the VPS.
set -euo pipefail

ETC=/etc/vente-web
STATE=/var/lib/vente-web
NET=10.66.0
PORT=51820
# Alert thresholds (CDC technique §10.5): unreachable 5 min, under 15 % free disk, certificate
# within 15 days; backups run every 15 minutes, so 2 hours without a complete one is a failure.
DOWN_SECONDS=300
DISK_PERCENT=15
CERT_SECONDS=$((15 * 86400))
BACKUP_SECONDS=$((2 * 3600))

die() { echo "Erreur : $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "lancer en root (sudo bash relais.sh …)."

# wg0.conf and the nginx map, rebuilt from the relay's key and one file per shop.
rebuild() {
  {
    printf '[Interface]\nAddress = %s.1/24\nListenPort = %s\nPrivateKey = %s\n' \
      "$NET" "$PORT" "$(cat "$ETC/relais.key")"
    for client in "$ETC"/clients/*.conf; do
      [ -e "$client" ] || continue
      # shellcheck source=/dev/null
      (. "$client"; printf '\n# %s\n[Peer]\nPublicKey = %s\nAllowedIPs = %s/32\n' \
        "$(basename "$client" .conf)" "$PUBLIC_KEY" "$ADDRESS")
    done
  } > /etc/wireguard/wg0.conf.new
  chmod 600 /etc/wireguard/wg0.conf.new
  mv /etc/wireguard/wg0.conf.new /etc/wireguard/wg0.conf

  for client in "$ETC"/clients/*.conf; do
    [ -e "$client" ] || continue
    (. "$client"; printf '%s %s:443;\n' "$(basename "$client" .conf)" "$ADDRESS")
  done > "$ETC/clients.map"

  if ip link show wg0 > /dev/null 2>&1; then
    wg syncconf wg0 <(wg-quick strip wg0)
  else
    systemctl enable --now wg-quick@wg0
  fi
  nginx -t -q
  systemctl reload-or-restart nginx
}

install_relay() {
  local ip=${1:-}
  [[ $ip =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "usage : bash relais.sh installer <adresse IP publique du VPS>"
  apt-get update -q
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q wireguard-tools nginx libnginx-mod-stream \
    curl jq openssl

  install -d -m 700 "$ETC" "$ETC/clients" "$STATE"
  [ -s "$ETC/relais.key" ] || (umask 077; wg genkey > "$ETC/relais.key")
  echo "$ip" > "$ETC/endpoint"
  # No routing between the tunnels (ADR-0008).
  echo 'net.ipv4.ip_forward = 0' > /etc/sysctl.d/90-vente-web.conf
  sysctl -q -p /etc/sysctl.d/90-vente-web.conf

  # Port 443 belongs to the stream router: no web site on this server.
  rm -f /etc/nginx/sites-enabled/default
  cat > /etc/nginx/vente-web.conf <<EOF
# The shops' router (relais.sh, T-086): the name asked picks the shop's tunnel; TLS ends there.
stream {
	map \$ssl_preread_server_name \$vente_web_shop {
		include $ETC/clients.map;
		default 127.0.0.1:9;
	}
	server {
		listen 443;
		ssl_preread on;
		proxy_pass \$vente_web_shop;
		proxy_protocol on;
		proxy_connect_timeout 5s;
	}
}
EOF
  grep -q '^include /etc/nginx/vente-web.conf;' /etc/nginx/nginx.conf \
    || echo 'include /etc/nginx/vente-web.conf;' >> /etc/nginx/nginx.conf
  rebuild

  # The monitoring (T-082): this script, run every minute.
  install -m 755 "${BASH_SOURCE[0]}" /usr/local/sbin/vente-web-relais
  [ -e "$ETC/alertes.env" ] || install -m 600 /dev/stdin "$ETC/alertes.env" <<'EOF'
# Alert e-mails of the monitoring (relais.sh, T-082), e.g. an OVH mailbox:
# SMTP_URL=smtps://ssl0.ovh.net:465  SMTP_USER=alertes@domaine.mg  ALERT_FROM=alertes@domaine.mg
# ALERT_TO: the developer, told of every problem; each shop's CONTACTS (its clients/*.conf),
# only of the shop being unreachable. Quote values holding spaces.
SMTP_URL=
SMTP_USER=
SMTP_PASSWORD=
ALERT_FROM=
ALERT_TO=
EOF
  cat > /etc/systemd/system/vente-web-surveillance.service <<'EOF'
[Unit]
Description=Vente Web : surveillance des magasins (T-082)
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/vente-web-relais surveiller
EOF
  cat > /etc/systemd/system/vente-web-surveillance.timer <<'EOF'
[Unit]
Description=Vente Web : surveillance des magasins chaque minute
[Timer]
OnCalendar=minutely
[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now vente-web-surveillance.timer

  echo "Relais prêt : WireGuard sur $ip:$PORT (UDP), aiguillage HTTPS sur le port 443."
  echo "Pare-feu OVH, s'il est actif : ouvrir 443/TCP et $PORT/UDP (et SSH)."
  echo "Alertes par e-mail : remplir $ETC/alertes.env."
  echo "Ajouter un magasin : bash relais.sh ajouter app.domaine-du-magasin.mg admin@… boss@…"
}

# One e-mail; no SMTP set, it only goes to the journal (journalctl -u vente-web-surveillance).
send_mail() {
  local subject=$1 body=$2 to
  shift 2
  echo "$subject : $body"
  [ -n "${SMTP_URL:-}" ] && [ $# -gt 0 ] || return 0
  local rcpt=()
  for to in "$@"; do rcpt+=(--mail-rcpt "$to"); done
  # The password through a config file, never on the command line (ps).
  printf 'From: %s\nTo: %s\nDate: %s\nSubject: %s\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: 8bit\n\n%s\n' \
    "$ALERT_FROM" "$(IFS=,; echo "$*")" "$(date -R)" "$subject" "$body" |
    curl -sS --ssl-reqd --crlf --max-time 30 --url "$SMTP_URL" --mail-from "$ALERT_FROM" \
      "${rcpt[@]}" -T - -K <(printf 'user = "%s:%s"\n' "$(quote "$SMTP_USER")" "$(quote "$SMTP_PASSWORD")")
}

quote() { local v=${1//\\/\\\\}; printf '%s' "${v//\"/\\\"}"; }

# The shop's problems, one per line, constant texts: a new e-mail only when the list changes.
problems() {
  local domain=$1 body code at
  body=$(mktemp)
  code=$(curl -sS -o "$body" -w '%{http_code}' --max-time 15 --resolve "$domain:443:127.0.0.1" \
    "https://$domain/healthz" 2> /dev/null) || code=000
  if [ "$code" = 000 ]; then
    echo "Serveur injoignable (courant, Internet ou PC du serveur éteint)"
  elif [ "$(jq -r '.database // empty' "$body" 2> /dev/null)" != ok ]; then
    echo "Application en panne (base de données ou API arrêtée)"
  else
    [ "$(jq -r '.diskFreePercent // 100' "$body")" -ge "$DISK_PERCENT" ] \
      || echo "Disque du serveur : moins de $DISK_PERCENT % libres"
    if jq -e 'has("lastBackupAt")' "$body" > /dev/null; then
      at=$(jq -r '.lastBackupAt // empty' "$body")
      if [ -z "$at" ] || [ $(($(date +%s) - $(date -d "$at" +%s))) -gt "$BACKUP_SECONDS" ]; then
        echo "Pas de sauvegarde complète depuis plus de $((BACKUP_SECONDS / 3600)) heures (journaux\\sauvegarde.log)"
      fi
    fi
    openssl s_client -connect 127.0.0.1:443 -servername "$domain" < /dev/null 2> /dev/null \
      | openssl x509 -noout -checkend "$CERT_SECONDS" > /dev/null 2>&1 \
      || echo "Certificat HTTPS : expire dans moins de 15 jours"
  fi
  rm -f "$body"
}

watch_shops() {
  [ -e "$ETC/alertes.env" ] && . "$ETC/alertes.env"
  local client domain found sent since now c
  for client in "$ETC"/clients/*.conf; do
    [ -e "$client" ] || continue
    domain=$(basename "$client" .conf)
    local CONTACTS=''
    . "$client"
    found=$(problems "$domain")
    now=$(date +%s)
    # Unreachable counts after 5 minutes only: a short cut of power or Internet is no alert.
    if [[ $found == "Serveur injoignable"* ]]; then
      [ -s "$STATE/$domain.depuis" ] || echo "$now" > "$STATE/$domain.depuis"
      since=$(cat "$STATE/$domain.depuis")
      [ $((now - since)) -ge "$DOWN_SECONDS" ] || continue
    else
      rm -f "$STATE/$domain.depuis"
    fi
    sent=$(cat "$STATE/$domain.signale" 2> /dev/null || true)
    [ "$found" != "$sent" ] || continue
    # The shop's admin and owner hear of it being unreachable, and of its return.
    local to=()
    if [ -n "${ALERT_TO:-}" ]; then to+=("$ALERT_TO"); fi
    if [[ "$found$sent" == *"Serveur injoignable"* ]]; then
      for c in $CONTACTS; do to+=("$c"); done
    fi
    if [ -n "$found" ]; then
      send_mail "Vente Web - $domain : alerte" "$found" "${to[@]}" || continue
    else
      send_mail "Vente Web - $domain : fin d'alerte" "Tout est revenu à la normale." "${to[@]}" || continue
    fi
    printf '%s' "$found" > "$STATE/$domain.signale"
  done
}

add_shop() {
  local domain=${1:-}
  [[ $domain =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || die "usage : bash relais.sh ajouter <domaine du magasin, en minuscules>"
  [ -s "$ETC/relais.key" ] || die "relais non installé : bash relais.sh installer <adresse IP>"
  [ -e "$ETC/clients/$domain.conf" ] && die "$domain est déjà sur ce relais."
  shift
  local contact
  for contact in "$@"; do
    [[ $contact =~ ^[^@[:space:]]+@[^@[:space:]]+$ ]] || die "adresse e-mail invalide : $contact"
  done

  # The next free tunnel address; .1 is the relay's.
  local last=1 client n
  for client in "$ETC"/clients/*.conf; do
    [ -e "$client" ] || continue
    n=$(. "$client"; echo "${ADDRESS##*.}")
    if [ "$n" -gt "$last" ]; then last=$n; fi
  done
  [ "$last" -lt 254 ] || die "plus d'adresse libre dans $NET.0/24."
  local address="$NET.$((last + 1))" private public
  private=$(wg genkey)
  public=$(echo "$private" | wg pubkey)
  # CONTACTS: told when the shop is unreachable (T-082); edit this file to change them.
  printf 'ADDRESS=%s\nPUBLIC_KEY=%s\nCONTACTS="%s"\n' "$address" "$public" "$*" \
    > "$ETC/clients/$domain.conf"
  rebuild

  # The shop's private key is shown once and kept nowhere here.
  echo "Magasin ajouté : $domain (tunnel $address)."
  echo "À copier dans son fichier de paramètres (client.env), jamais ailleurs :"
  echo "WG_PRIVATE_KEY=$private"
  echo "WG_ADDRESS=$address"
  echo "RELAY_PUBLIC_KEY=$(wg pubkey < "$ETC/relais.key")"
  echo "RELAY_ENDPOINT=$(cat "$ETC/endpoint"):$PORT"
  echo "RELAY_WG_IP=$NET.1"
  echo "Zone DNS OVH du domaine : enregistrement A de $domain vers $(cat "$ETC/endpoint")."
}

case ${1:-} in
  installer) install_relay "${2:-}" ;;
  ajouter) shift; add_shop "$@" ;;
  surveiller) watch_shops ;;
  *) die "usage : bash relais.sh installer <adresse IP> | ajouter <domaine> [e-mails…]" ;;
esac
