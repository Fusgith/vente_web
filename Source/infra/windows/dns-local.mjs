// Local DNS of the shop (CDC technique §2.1, T-080): inside the shop, APP_DOMAIN answers the
// server's LAN address, so tablets reach it without the Internet; every other name is passed to
// UPSTREAM_DNS. The box's DHCP hands this server out as the DNS (Dist README).
//   node dns-local.mjs   (APP_DOMAIN, LAN_IP, UPSTREAM_DNS from the environment)
import dgram from 'node:dgram';

const domain = (process.env.APP_DOMAIN ?? '').toLowerCase().replace(/\.$/, '');
const lanIp = process.env.LAN_IP ?? '';
const upstream = process.env.UPSTREAM_DNS || '1.1.1.1';
if (!domain || !/^\d{1,3}(\.\d{1,3}){3}$/.test(lanIp)) {
  console.error('APP_DOMAIN et LAN_IP sont requis (fichier .env des données).');
  process.exit(1);
}

const TYPE_A = 1;
const TTL = 300;

/** The question's name, type and end offset; null when the packet is no plain query. */
function question(packet) {
  if (packet.length < 17 || packet.readUInt16BE(4) !== 1) return null;
  const labels = [];
  let at = 12;
  while (at < packet.length && packet[at] !== 0) {
    const size = packet[at];
    if (size > 63 || at + 1 + size > packet.length) return null;
    labels.push(packet.toString('latin1', at + 1, at + 1 + size));
    at += 1 + size;
  }
  if (at + 5 > packet.length) return null;
  return { name: labels.join('.').toLowerCase(), type: packet.readUInt16BE(at + 1), end: at + 5 };
}

/** The answer for APP_DOMAIN: its A record, or no record for any other type (AAAA…). */
function localAnswer(query, asked) {
  const header = Buffer.from(query.subarray(0, 12));
  header.writeUInt16BE(0x8400 | (query.readUInt16BE(2) & 0x0100), 2); // response, authoritative, RD kept
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(asked.type === TYPE_A ? 1 : 0, 6);
  header.writeUInt32BE(0, 8);
  const parts = [header, query.subarray(12, asked.end)];
  if (asked.type === TYPE_A) {
    const record = Buffer.alloc(16);
    record.writeUInt16BE(0xc00c, 0); // the name of the question
    record.writeUInt16BE(TYPE_A, 2);
    record.writeUInt16BE(1, 4);
    record.writeUInt32BE(TTL, 6);
    record.writeUInt16BE(4, 10);
    lanIp.split('.').forEach((byte, index) => record.writeUInt8(Number(byte), 12 + index));
    parts.push(record);
  }
  return Buffer.concat(parts);
}

const server = dgram.createSocket('udp4');
server.on('message', (packet, client) => {
  const asked = question(packet);
  if (asked?.name === domain) {
    server.send(localAnswer(packet, asked), client.port, client.address);
    return;
  }
  const relay = dgram.createSocket('udp4');
  const timer = setTimeout(() => relay.close(), 4000);
  relay.on('message', (answer) => {
    clearTimeout(timer);
    relay.close();
    server.send(answer, client.port, client.address);
  });
  relay.on('error', () => {
    clearTimeout(timer);
    relay.close();
  });
  relay.send(packet, 53, upstream);
});
server.on('error', (error) => {
  console.error(`DNS local arrêté : ${error.message}`);
  process.exit(1);
});
server.bind(Number(process.env.DNS_PORT || 53), lanIp, () => {
  process.stdout.write(`DNS local : ${domain} → ${lanIp}, le reste vers ${upstream}.\n`);
});
