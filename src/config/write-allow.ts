import { BlockList } from 'node:net';

// 默认仅本机与内网段可写；调用方可用 PANEL_WRITE_CIDRS 整体替换该默认值
export const DEFAULT_WRITE_CIDRS = '127.0.0.1/32,::1/128,192.168.9.0/24';

export function buildWriteList(raw: string): BlockList {
  const list = new BlockList();
  for (const entry of raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const parts = entry.split('/');
    if (parts.length > 2) {
      throw new Error(`invalid CIDR: ${entry}`);
    }
    const [addr, prefixText] = parts;
    const type = addr.includes(':') ? 'ipv6' : 'ipv4';
    const maxPrefix = type === 'ipv6' ? 128 : 32;
    if (prefixText !== undefined && !/^\d+$/.test(prefixText)) {
      throw new Error(`invalid CIDR: ${entry}`);
    }
    const prefix = prefixText === undefined ? maxPrefix : Number(prefixText);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
      throw new Error(`invalid CIDR: ${entry}`);
    }
    list.addSubnet(addr, prefix, type);
  }
  return list;
}

export function isWriteAllowed(list: BlockList, ip: string): boolean {
  const type = ip.includes(':') ? 'ipv6' : 'ipv4';
  return list.check(ip, type);
}
