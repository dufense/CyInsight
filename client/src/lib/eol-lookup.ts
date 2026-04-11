interface EOLResult {
  product: string;
  vendor: string;
  versionLabel: string;
  eosDate: string | null;
  eolDate: string | null;
  eosStatus: "active" | "approaching" | "ended";
  eolStatus: "active" | "approaching" | "ended";
  successor?: string;
}

function getStatus(dateStr: string | null): "active" | "approaching" | "ended" {
  if (!dateStr) return "active";
  const d = new Date(dateStr);
  const now = new Date();
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  if (now > d) return "ended";
  if (sixMonths > d) return "approaching";
  return "active";
}

const entries: Array<{
  p: RegExp;
  product: string;
  vendor: string;
  v: Array<{ vp: RegExp; l: string; eos: string | null; eol: string | null; s?: string }>;
  dEos?: string | null;
  dEol?: string | null;
}> = [
  { p: /windows/i, product: "Microsoft Windows", vendor: "Microsoft", v: [
    { vp: /xp/i, l: "Windows XP", eos: "2009-04-14", eol: "2014-04-08", s: "Windows 7" },
    { vp: /vista/i, l: "Windows Vista", eos: "2012-04-10", eol: "2017-04-11" },
    { vp: /windows\s*7/i, l: "Windows 7", eos: "2015-01-13", eol: "2020-01-14", s: "Windows 10" },
    { vp: /8\.1/i, l: "Windows 8.1", eos: "2018-01-09", eol: "2023-01-10" },
    { vp: /windows\s*8/i, l: "Windows 8", eos: "2016-01-12", eol: "2016-01-12" },
    { vp: /10.*22H2/i, l: "Windows 10 22H2", eos: "2025-10-14", eol: "2025-10-14", s: "Windows 11" },
    { vp: /windows\s*10/i, l: "Windows 10", eos: "2025-10-14", eol: "2025-10-14", s: "Windows 11" },
    { vp: /11.*24H2/i, l: "Windows 11 24H2", eos: "2026-10-13", eol: "2027-10-12" },
    { vp: /11.*23H2/i, l: "Windows 11 23H2", eos: "2025-11-11", eol: "2026-11-10" },
    { vp: /windows\s*11/i, l: "Windows 11", eos: null, eol: null },
    { vp: /server\s*2003/i, l: "Server 2003", eos: "2010-07-13", eol: "2015-07-14" },
    { vp: /server\s*2008\s*r2/i, l: "Server 2008 R2", eos: "2015-01-13", eol: "2020-01-14" },
    { vp: /server\s*2008/i, l: "Server 2008", eos: "2015-01-13", eol: "2020-01-14" },
    { vp: /server\s*2012\s*r2/i, l: "Server 2012 R2", eos: "2018-10-09", eol: "2023-10-10" },
    { vp: /server\s*2012/i, l: "Server 2012", eos: "2018-10-09", eol: "2023-10-10" },
    { vp: /server\s*2016/i, l: "Server 2016", eos: "2022-01-11", eol: "2027-01-12" },
    { vp: /server\s*2019/i, l: "Server 2019", eos: "2024-01-09", eol: "2029-01-09" },
    { vp: /server\s*2022/i, l: "Server 2022", eos: "2026-10-13", eol: "2031-10-14" },
    { vp: /server\s*2025/i, l: "Server 2025", eos: null, eol: null },
  ]},
  { p: /office|word|excel|powerpoint|outlook/i, product: "Microsoft Office", vendor: "Microsoft", v: [
    { vp: /2007|12\.0/i, l: "Office 2007", eos: "2012-10-09", eol: "2017-10-10" },
    { vp: /2010|14\.0/i, l: "Office 2010", eos: "2015-10-13", eol: "2020-10-13" },
    { vp: /2013|15\.0/i, l: "Office 2013", eos: "2018-04-10", eol: "2023-04-11" },
    { vp: /2016|16\.0\.4/i, l: "Office 2016", eos: "2020-10-13", eol: "2025-10-14" },
    { vp: /2019/i, l: "Office 2019", eos: "2023-10-10", eol: "2025-10-14" },
    { vp: /2021/i, l: "Office 2021", eos: "2026-10-13", eol: "2026-10-13" },
    { vp: /2024/i, l: "Office 2024", eos: "2029-10-09", eol: "2029-10-09" },
    { vp: /365|m365/i, l: "Microsoft 365", eos: null, eol: null },
  ]},
  { p: /\.net|dotnet/i, product: ".NET", vendor: "Microsoft", v: [
    { vp: /4\.[0-5]/i, l: ".NET Framework 4.x (old)", eos: "2022-04-26", eol: "2022-04-26" },
    { vp: /4\.[6-8]/i, l: ".NET Framework 4.6+", eos: null, eol: null },
    { vp: /6\.0/i, l: ".NET 6.0", eos: "2024-11-12", eol: "2024-11-12" },
    { vp: /7\.0/i, l: ".NET 7.0", eos: "2024-05-14", eol: "2024-05-14" },
    { vp: /8\.0/i, l: ".NET 8.0", eos: "2026-11-10", eol: "2026-11-10" },
  ]},
  { p: /java|jdk|jre/i, product: "Java", vendor: "Oracle", v: [
    { vp: /\b8\b|1\.8/i, l: "Java 8", eos: "2022-03-01", eol: "2030-12-01" },
    { vp: /\b11\b/i, l: "Java 11 (LTS)", eos: "2023-09-01", eol: "2032-01-01" },
    { vp: /\b17\b/i, l: "Java 17 (LTS)", eos: "2026-09-01", eol: "2029-09-01" },
    { vp: /\b21\b/i, l: "Java 21 (LTS)", eos: "2028-09-01", eol: "2031-09-01" },
  ]},
  { p: /internet\s*explorer/i, product: "Internet Explorer", vendor: "Microsoft", v: [
    { vp: /.*/, l: "Internet Explorer", eos: "2022-06-15", eol: "2023-02-14", s: "Microsoft Edge" },
  ]},
  { p: /adobe.*flash/i, product: "Adobe Flash", vendor: "Adobe", v: [
    { vp: /.*/, l: "Flash Player", eos: "2020-12-31", eol: "2020-12-31" },
  ]},
  { p: /adobe.*acrobat/i, product: "Adobe Acrobat", vendor: "Adobe", v: [
    { vp: /2017/i, l: "Acrobat 2017", eos: "2022-06-06", eol: "2022-06-06" },
    { vp: /2020/i, l: "Acrobat 2020", eos: "2025-06-01", eol: "2025-06-01" },
    { vp: /dc|continuous/i, l: "Acrobat DC", eos: null, eol: null },
  ]},
  { p: /sql\s*server/i, product: "SQL Server", vendor: "Microsoft", v: [
    { vp: /2008/i, l: "SQL Server 2008", eos: "2014-07-08", eol: "2019-07-09" },
    { vp: /2012/i, l: "SQL Server 2012", eos: "2017-07-11", eol: "2022-07-12" },
    { vp: /2014/i, l: "SQL Server 2014", eos: "2019-07-09", eol: "2024-07-09" },
    { vp: /2016/i, l: "SQL Server 2016", eos: "2021-07-13", eol: "2026-07-14" },
    { vp: /2017/i, l: "SQL Server 2017", eos: "2022-10-11", eol: "2027-10-12" },
    { vp: /2019/i, l: "SQL Server 2019", eos: "2025-01-07", eol: "2030-01-08" },
    { vp: /2022/i, l: "SQL Server 2022", eos: "2028-01-11", eol: "2033-01-11" },
  ]},
  { p: /python/i, product: "Python", vendor: "PSF", v: [
    { vp: /2\.7/i, l: "Python 2.7", eos: "2020-01-01", eol: "2020-01-01" },
    { vp: /3\.[6-8]/i, l: "Python 3.6-3.8", eos: "2024-10-07", eol: "2024-10-07" },
    { vp: /3\.9/i, l: "Python 3.9", eos: "2025-10-05", eol: "2025-10-05" },
    { vp: /3\.1[0-3]/i, l: "Python 3.10+", eos: null, eol: null },
  ]},
  { p: /vmware|esxi|vsphere/i, product: "VMware", vendor: "Broadcom", v: [
    { vp: /6\.[0-7]/i, l: "vSphere 6.x", eos: "2022-10-15", eol: "2024-11-15" },
    { vp: /7\.0/i, l: "vSphere 7.0", eos: "2025-04-02", eol: "2027-04-02" },
    { vp: /8\.0/i, l: "vSphere 8.0", eos: null, eol: null },
  ]},
  { p: /ubuntu/i, product: "Ubuntu", vendor: "Canonical", v: [
    { vp: /14/i, l: "Ubuntu 14.04", eos: "2019-04-25", eol: "2024-04-25" },
    { vp: /16/i, l: "Ubuntu 16.04", eos: "2021-04-30", eol: "2026-04-30" },
    { vp: /18/i, l: "Ubuntu 18.04", eos: "2023-05-31", eol: "2028-04-01" },
    { vp: /20/i, l: "Ubuntu 20.04", eos: "2025-04-02", eol: "2030-04-02" },
    { vp: /22/i, l: "Ubuntu 22.04", eos: "2027-04-01", eol: "2032-04-01" },
    { vp: /24/i, l: "Ubuntu 24.04", eos: "2029-04-25", eol: "2034-04-25" },
  ]},
  { p: /centos/i, product: "CentOS", vendor: "Red Hat", v: [
    { vp: /6/i, l: "CentOS 6", eos: "2017-05-10", eol: "2020-11-30" },
    { vp: /7/i, l: "CentOS 7", eos: "2020-08-06", eol: "2024-06-30" },
    { vp: /8/i, l: "CentOS 8", eos: "2021-12-31", eol: "2021-12-31" },
  ]},
  { p: /visual\s*c\+\+|vcredist/i, product: "VC++ Redist", vendor: "Microsoft", v: [
    { vp: /200[58]|9\.0|8\.0/i, l: "VC++ 2005/2008", eos: "2018-04-10", eol: "2018-04-10" },
    { vp: /2010|10\.0/i, l: "VC++ 2010", eos: "2020-07-14", eol: "2020-07-14" },
    { vp: /2012|11\.0/i, l: "VC++ 2012", eos: "2023-01-10", eol: "2023-01-10" },
    { vp: /2013|12\.0/i, l: "VC++ 2013", eos: "2024-04-09", eol: "2024-04-09" },
    { vp: /201[5-9]|202|14\.0/i, l: "VC++ 2015-2022", eos: null, eol: null },
  ]},
];

export function lookupEOL(softwareName: string, version: string): EOLResult | null {
  const combined = `${softwareName} ${version}`.trim();
  for (const e of entries) {
    if (!e.p.test(softwareName) && !e.p.test(combined)) continue;
    for (const ver of e.v) {
      if (ver.vp.test(combined) || ver.vp.test(version) || ver.vp.test(softwareName)) {
        return {
          product: e.product,
          vendor: e.vendor,
          versionLabel: ver.l,
          eosDate: ver.eos,
          eolDate: ver.eol,
          eosStatus: getStatus(ver.eos),
          eolStatus: getStatus(ver.eol),
          successor: ver.s,
        };
      }
    }
    if (e.dEos !== undefined || e.dEol !== undefined) {
      return {
        product: e.product,
        vendor: e.vendor,
        versionLabel: version || "Current",
        eosDate: e.dEos || null,
        eolDate: e.dEol || null,
        eosStatus: getStatus(e.dEos || null),
        eolStatus: getStatus(e.dEol || null),
      };
    }
  }
  return null;
}
