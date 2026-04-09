/**
 * 网络工具函数 - 用于安全检查
 */

/**
 * 检查是否为私有IP地址
 * @param ip IP地址字符串
 * @returns 是否为私有IP
 */
export function isPrivateIP(ip: string): boolean {
  // 处理 IPv4-mapped IPv6 地址，如 ::ffff:127.0.0.1
  let cleanIP = ip
  if (cleanIP.startsWith('::ffff:')) {
    cleanIP = cleanIP.slice(7)
  }
  // 移除端口号（仅对 IPv4 地址）
  if (!cleanIP.includes(':') || cleanIP.includes('.')) {
    const lastColon = cleanIP.lastIndexOf(':')
    if (lastColon !== -1 && cleanIP.includes('.')) {
      cleanIP = cleanIP.substring(0, lastColon)
    }
  }
  
  // IPv4 私有地址范围
  const ipv4PrivateRanges = [
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,          // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12
    /^192\.168\.\d{1,3}\.\d{1,3}$/,             // 192.168.0.0/16
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,         // 127.0.0.0/8 (localhost)
    /^169\.254\.\d{1,3}\.\d{1,3}$/,             // 169.254.0.0/16 (链路本地)
    /^192\.0\.0\.\d{1,3}$/,                      // 192.0.0.0/24
    /^192\.0\.2\.\d{1,3}$/,                      // 192.0.2.0/24 (文档地址)
    /^198\.18\.\d{1,3}\.\d{1,3}$/,               // 198.18.0.0/15 (基准测试)
    /^198\.51\.100\.\d{1,3}$/,                   // 198.51.100.0/24 (文档地址)
    /^203\.0\.113\.\d{1,3}$/,                    // 203.0.113.0/24 (文档地址)
    /^224\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,         // 224.0.0.0/4 (多播)
    /^240\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,         // 240.0.0.0/4 (保留)
    /^255\.255\.255\.255$/,                      // 广播地址
  ]
  
  // IPv6 私有地址范围
  const ipv6PrivateRanges = [
    /^::1$/,                                     // 环回地址
    /^fc[0-9a-f]{2}:/i,                         // 唯一本地地址 fc00::/7
    /^fd[0-9a-f]{2}:/i,                         // 唯一本地地址 fc00::/7
    /^fe80:/i,                                  // 链路本地地址
    /^ff[0-9a-f]{2}:/i,                         // 多播地址
  ]
  
  // 检查IPv4
  for (const range of ipv4PrivateRanges) {
    if (range.test(cleanIP)) {
      return true
    }
  }
  
  // 检查IPv6
  for (const range of ipv6PrivateRanges) {
    if (range.test(cleanIP.toLowerCase())) {
      return true
    }
  }
  
  return false
}

/**
 * 检查URL是否安全（非私有网络）
 * @param url URL字符串
 * @returns 是否安全
 */
export function isSafeURL(url: string): { safe: boolean; reason?: string } {
  try {
    const urlObj = new URL(url)
    
    // 只允许http和https协议
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { safe: false, reason: `不支持的协议: ${urlObj.protocol}` }
    }
    
    // 检查是否为私有IP
    if (isPrivateIP(urlObj.hostname)) {
      return { safe: false, reason: '禁止访问私有网络地址' }
    }
    
    // 检查是否为localhost
    if (urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1') {
      return { safe: false, reason: '禁止访问本地服务' }
    }
    
    // 检查是否为保留域名
    const reservedDomains = ['.local', '.internal', '.localhost', '.test', '.example']
    for (const domain of reservedDomains) {
      if (urlObj.hostname.endsWith(domain)) {
        return { safe: false, reason: `禁止访问保留域名: ${urlObj.hostname}` }
      }
    }
    
    return { safe: true }
  } catch (error) {
    return { safe: false, reason: `无效的URL: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * 检查主机名是否安全
 * @param hostname 主机名
 * @returns 是否安全
 */
export function isSafeHostname(hostname: string): boolean {
  // 检查是否为IP地址
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6Regex = /^[0-9a-fA-F:]+$/
  
  if (ipv4Regex.test(hostname) || ipv6Regex.test(hostname)) {
    return !isPrivateIP(hostname)
  }
  
  // 检查是否为保留域名
  const reservedDomains = ['.local', '.internal', '.localhost', '.test', '.example']
  for (const domain of reservedDomains) {
    if (hostname.endsWith(domain)) {
      return false
    }
  }
  
  // 检查是否为localhost
  if (hostname.toLowerCase() === 'localhost') {
    return false
  }
  
  return true
}