#!/usr/bin/env bash
# The OVH relay shared by the shops (T-086, ADR-0008), on a Debian 12 or Ubuntu 24.04 VPS, as root:
#   bash relais.sh installer <adresse IP publique du VPS>   once; rerun: nothing set up is lost
#   bash relais.sh ajouter <domaine du magasin>             a shop: prints its tunnel parameters
# Each shop opens an outgoing WireGuard tunnel to here; nginx routes HTTPS by the name asked (SNI)
# to that shop's tunnel without decrypting it, the client's address carried by the PROXY
# protocol. No IP forwarding: a shop never reaches another one. Messages are in French: the
# developer runs this on the VPS.
set -euo pipefail

ETC=/etc/vente-web
NET=10.66.0
PORT=51820

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
  DEBIAN_FRONTEND=noninteractive apt-get install -y -q wireguard-tools nginx libnginx-mod-stream

  install -d -m 700 "$ETC" "$ETC/clients"
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

  echo "Relais prêt : WireGuard sur $ip:$PORT (UDP), aiguillage HTTPS sur le port 443."
  echo "Pare-feu OVH, s'il est actif : ouvrir 443/TCP et $PORT/UDP (et SSH)."
  echo "Ajouter un magasin : bash relais.sh ajouter app.domaine-du-magasin.mg"
}

add_shop() {
  local domain=${1:-}
  [[ $domain =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || die "usage : bash relais.sh ajouter <domaine du magasin, en minuscules>"
  [ -s "$ETC/relais.key" ] || die "relais non installé : bash relais.sh installer <adresse IP>"
  [ -e "$ETC/clients/$domain.conf" ] && die "$domain est déjà sur ce relais."

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
  printf 'ADDRESS=%s\nPUBLIC_KEY=%s\n' "$address" "$public" > "$ETC/clients/$domain.conf"
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
  ajouter) add_shop "${2:-}" ;;
  *) die "usage : bash relais.sh installer <adresse IP> | ajouter <domaine>" ;;
esac
