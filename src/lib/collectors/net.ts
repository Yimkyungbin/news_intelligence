// SSRF 방지용 IP 검사 (순수 함수)
import { isIP } from "node:net";

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

function inV4(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

const BLOCKED_V4 = [
  "0.0.0.0/8", // 현재 네트워크
  "10.0.0.0/8", // 사설
  "100.64.0.0/10", // CGNAT
  "127.0.0.0/8", // 루프백
  "169.254.0.0/16", // 링크로컬 (클라우드 메타데이터 169.254.169.254 포함)
  "172.16.0.0/12", // 사설
  "192.0.0.0/24",
  "192.0.2.0/24", // 문서용
  "192.168.0.0/16", // 사설
  "198.18.0.0/15", // 벤치마크
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4", // 멀티캐스트
  "240.0.0.0/4", // 예약 + 브로드캐스트
];

/** 공인 인터넷 주소이면 true. 형식이 잘못됐거나 내부 대역이면 false */
export function isPublicAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return !BLOCKED_V4.some((c) => inV4(address, c));
  if (kind !== 6) return false;

  const a = address.toLowerCase().split("%")[0];
  // IPv4-mapped (::ffff:a.b.c.d) → IPv4 규칙 적용
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicAddress(mapped[1]);
  if (a === "::" || a === "::1") return false;
  const first = parseInt(a.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 고유 로컬
  if ((first & 0xffc0) === 0xfe80) return false; // fe80::/10 링크로컬
  if ((first & 0xff00) === 0xff00) return false; // ff00::/8 멀티캐스트
  if (a.startsWith("2001:db8")) return false; // 문서용
  if (a.startsWith("64:ff9b:")) return false; // NAT64 (내부 IPv4 우회 가능)
  return true;
}
