export interface EOLEntry {
  pattern: RegExp;
  product: string;
  vendor: string;
  versions: Array<{
    versionPattern: RegExp;
    versionLabel: string;
    eosDate: string | null;
    eolDate: string | null;
    successor?: string;
  }>;
  defaultEosDate?: string | null;
  defaultEolDate?: string | null;
}

export interface EOLResult {
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

const EOL_DATABASE: EOLEntry[] = [
  // === MICROSOFT WINDOWS ===
  {
    pattern: /windows/i,
    product: "Microsoft Windows",
    vendor: "Microsoft",
    versions: [
      { versionPattern: /windows\s*xp/i, versionLabel: "Windows XP", eosDate: "2009-04-14", eolDate: "2014-04-08", successor: "Windows 7" },
      { versionPattern: /windows\s*vista/i, versionLabel: "Windows Vista", eosDate: "2012-04-10", eolDate: "2017-04-11", successor: "Windows 7" },
      { versionPattern: /windows\s*7/i, versionLabel: "Windows 7", eosDate: "2015-01-13", eolDate: "2020-01-14", successor: "Windows 10" },
      { versionPattern: /windows\s*8(?!\.1)/i, versionLabel: "Windows 8", eosDate: "2016-01-12", eolDate: "2016-01-12", successor: "Windows 8.1" },
      { versionPattern: /windows\s*8\.1/i, versionLabel: "Windows 8.1", eosDate: "2018-01-09", eolDate: "2023-01-10", successor: "Windows 10" },
      { versionPattern: /windows\s*10.*(?:1507|build\s*10240)/i, versionLabel: "Windows 10 1507", eosDate: "2017-05-09", eolDate: "2017-05-09" },
      { versionPattern: /windows\s*10.*1607/i, versionLabel: "Windows 10 1607", eosDate: "2019-04-09", eolDate: "2019-04-09" },
      { versionPattern: /windows\s*10.*1703/i, versionLabel: "Windows 10 1703", eosDate: "2019-10-08", eolDate: "2019-10-08" },
      { versionPattern: /windows\s*10.*1709/i, versionLabel: "Windows 10 1709", eosDate: "2020-10-13", eolDate: "2020-10-13" },
      { versionPattern: /windows\s*10.*1803/i, versionLabel: "Windows 10 1803", eosDate: "2020-11-10", eolDate: "2021-05-11" },
      { versionPattern: /windows\s*10.*1809/i, versionLabel: "Windows 10 1809", eosDate: "2020-11-10", eolDate: "2021-05-11" },
      { versionPattern: /windows\s*10.*1903/i, versionLabel: "Windows 10 1903", eosDate: "2020-12-08", eolDate: "2020-12-08" },
      { versionPattern: /windows\s*10.*1909/i, versionLabel: "Windows 10 1909", eosDate: "2021-05-11", eolDate: "2022-05-10" },
      { versionPattern: /windows\s*10.*2004/i, versionLabel: "Windows 10 2004", eosDate: "2021-12-14", eolDate: "2021-12-14" },
      { versionPattern: /windows\s*10.*20H2/i, versionLabel: "Windows 10 20H2", eosDate: "2022-05-10", eolDate: "2023-05-09" },
      { versionPattern: /windows\s*10.*21H1/i, versionLabel: "Windows 10 21H1", eosDate: "2022-12-13", eolDate: "2022-12-13" },
      { versionPattern: /windows\s*10.*21H2/i, versionLabel: "Windows 10 21H2", eosDate: "2023-06-13", eolDate: "2024-06-11" },
      { versionPattern: /windows\s*10.*22H2/i, versionLabel: "Windows 10 22H2", eosDate: "2025-10-14", eolDate: "2025-10-14" },
      { versionPattern: /windows\s*10/i, versionLabel: "Windows 10", eosDate: "2025-10-14", eolDate: "2025-10-14", successor: "Windows 11" },
      { versionPattern: /windows\s*11.*21H2/i, versionLabel: "Windows 11 21H2", eosDate: "2023-10-10", eolDate: "2024-10-08" },
      { versionPattern: /windows\s*11.*22H2/i, versionLabel: "Windows 11 22H2", eosDate: "2024-10-08", eolDate: "2025-10-14" },
      { versionPattern: /windows\s*11.*23H2/i, versionLabel: "Windows 11 23H2", eosDate: "2025-11-11", eolDate: "2026-11-10" },
      { versionPattern: /windows\s*11.*24H2/i, versionLabel: "Windows 11 24H2", eosDate: "2026-10-13", eolDate: "2027-10-12" },
      { versionPattern: /windows\s*11/i, versionLabel: "Windows 11", eosDate: null, eolDate: null },
      { versionPattern: /server\s*2003/i, versionLabel: "Windows Server 2003", eosDate: "2010-07-13", eolDate: "2015-07-14" },
      { versionPattern: /server\s*2008\s*r2/i, versionLabel: "Windows Server 2008 R2", eosDate: "2015-01-13", eolDate: "2020-01-14" },
      { versionPattern: /server\s*2008(?!\s*r2)/i, versionLabel: "Windows Server 2008", eosDate: "2015-01-13", eolDate: "2020-01-14" },
      { versionPattern: /server\s*2012\s*r2/i, versionLabel: "Windows Server 2012 R2", eosDate: "2018-10-09", eolDate: "2023-10-10" },
      { versionPattern: /server\s*2012(?!\s*r2)/i, versionLabel: "Windows Server 2012", eosDate: "2018-10-09", eolDate: "2023-10-10" },
      { versionPattern: /server\s*2016/i, versionLabel: "Windows Server 2016", eosDate: "2022-01-11", eolDate: "2027-01-12" },
      { versionPattern: /server\s*2019/i, versionLabel: "Windows Server 2019", eosDate: "2024-01-09", eolDate: "2029-01-09" },
      { versionPattern: /server\s*2022/i, versionLabel: "Windows Server 2022", eosDate: "2026-10-13", eolDate: "2031-10-14" },
      { versionPattern: /server\s*2025/i, versionLabel: "Windows Server 2025", eosDate: null, eolDate: null },
    ],
  },

  // === MICROSOFT OFFICE ===
  {
    pattern: /microsoft\s*(office|365)|office\s*(365|2\d{3})|word|excel|powerpoint|outlook|onenote|access|publisher|visio/i,
    product: "Microsoft Office",
    vendor: "Microsoft",
    versions: [
      { versionPattern: /office\s*2007|12\.0/i, versionLabel: "Office 2007", eosDate: "2012-10-09", eolDate: "2017-10-10", successor: "Office 2010" },
      { versionPattern: /office\s*2010|14\.0/i, versionLabel: "Office 2010", eosDate: "2015-10-13", eolDate: "2020-10-13", successor: "Office 2013" },
      { versionPattern: /office\s*2013|15\.0/i, versionLabel: "Office 2013", eosDate: "2018-04-10", eolDate: "2023-04-11", successor: "Office 2016" },
      { versionPattern: /office\s*2016|16\.0\.4/i, versionLabel: "Office 2016", eosDate: "2020-10-13", eolDate: "2025-10-14", successor: "Office 2019" },
      { versionPattern: /office\s*2019|16\.0\.(10|11|12)/i, versionLabel: "Office 2019", eosDate: "2023-10-10", eolDate: "2025-10-14", successor: "Office 2021" },
      { versionPattern: /office\s*2021|16\.0\.(14|15|16)/i, versionLabel: "Office 2021", eosDate: "2026-10-13", eolDate: "2026-10-13", successor: "Office 2024" },
      { versionPattern: /office\s*2024/i, versionLabel: "Office 2024", eosDate: "2029-10-09", eolDate: "2029-10-09" },
      { versionPattern: /microsoft\s*365|office\s*365|m365/i, versionLabel: "Microsoft 365", eosDate: null, eolDate: null },
    ],
  },

  // === .NET FRAMEWORK ===
  {
    pattern: /\.net\s*(framework|runtime|sdk)|dotnet/i,
    product: ".NET Framework / Runtime",
    vendor: "Microsoft",
    versions: [
      { versionPattern: /\.net\s*(framework\s*)?2\.0/i, versionLabel: ".NET Framework 2.0", eosDate: "2011-04-12", eolDate: "2011-04-12" },
      { versionPattern: /\.net\s*(framework\s*)?3\.0/i, versionLabel: ".NET Framework 3.0", eosDate: "2011-04-12", eolDate: "2011-04-12" },
      { versionPattern: /\.net\s*(framework\s*)?3\.5/i, versionLabel: ".NET Framework 3.5", eosDate: null, eolDate: null },
      { versionPattern: /\.net\s*(framework\s*)?4\.0/i, versionLabel: ".NET Framework 4.0", eosDate: "2016-01-12", eolDate: "2016-01-12" },
      { versionPattern: /\.net\s*(framework\s*)?4\.5(?!\.\d)/i, versionLabel: ".NET Framework 4.5", eosDate: "2016-01-12", eolDate: "2016-01-12" },
      { versionPattern: /\.net\s*(framework\s*)?4\.5\.1/i, versionLabel: ".NET Framework 4.5.1", eosDate: "2016-01-12", eolDate: "2016-01-12" },
      { versionPattern: /\.net\s*(framework\s*)?4\.5\.2/i, versionLabel: ".NET Framework 4.5.2", eosDate: "2022-04-26", eolDate: "2022-04-26" },
      { versionPattern: /\.net\s*(framework\s*)?4\.6(?!\.)/i, versionLabel: ".NET Framework 4.6", eosDate: "2022-04-26", eolDate: "2022-04-26" },
      { versionPattern: /\.net\s*(framework\s*)?4\.6\.1/i, versionLabel: ".NET Framework 4.6.1", eosDate: "2022-04-26", eolDate: "2022-04-26" },
      { versionPattern: /\.net\s*(framework\s*)?4\.6\.2/i, versionLabel: ".NET Framework 4.6.2", eosDate: "2027-01-12", eolDate: "2027-01-12" },
      { versionPattern: /\.net\s*(framework\s*)?4\.7/i, versionLabel: ".NET Framework 4.7.x", eosDate: null, eolDate: null },
      { versionPattern: /\.net\s*(framework\s*)?4\.8/i, versionLabel: ".NET Framework 4.8.x", eosDate: null, eolDate: null },
      { versionPattern: /\.net\s*(runtime|sdk)?\s*3\.1|dotnet.*3\.1/i, versionLabel: ".NET 3.1 (Core)", eosDate: "2022-12-13", eolDate: "2022-12-13" },
      { versionPattern: /\.net\s*(runtime|sdk)?\s*5\.0|dotnet.*5\.0/i, versionLabel: ".NET 5.0", eosDate: "2022-05-10", eolDate: "2022-05-10" },
      { versionPattern: /\.net\s*(runtime|sdk)?\s*6\.0|dotnet.*6\.0/i, versionLabel: ".NET 6.0", eosDate: "2024-11-12", eolDate: "2024-11-12" },
      { versionPattern: /\.net\s*(runtime|sdk)?\s*7\.0|dotnet.*7\.0/i, versionLabel: ".NET 7.0", eosDate: "2024-05-14", eolDate: "2024-05-14" },
      { versionPattern: /\.net\s*(runtime|sdk)?\s*8\.0|dotnet.*8\.0/i, versionLabel: ".NET 8.0", eosDate: "2026-11-10", eolDate: "2026-11-10" },
      { versionPattern: /\.net\s*(runtime|sdk)?\s*9\.0|dotnet.*9\.0/i, versionLabel: ".NET 9.0", eosDate: "2026-05-12", eolDate: "2026-05-12" },
    ],
  },

  // === VISUAL C++ REDISTRIBUTABLE ===
  {
    pattern: /visual\s*c\+\+|vcredist|redistributable.*visual/i,
    product: "Visual C++ Redistributable",
    vendor: "Microsoft",
    versions: [
      { versionPattern: /2005|8\.0/i, versionLabel: "VC++ 2005", eosDate: "2016-04-12", eolDate: "2016-04-12" },
      { versionPattern: /2008|9\.0/i, versionLabel: "VC++ 2008", eosDate: "2018-04-10", eolDate: "2018-04-10" },
      { versionPattern: /2010|10\.0/i, versionLabel: "VC++ 2010", eosDate: "2020-07-14", eolDate: "2020-07-14" },
      { versionPattern: /2012|11\.0/i, versionLabel: "VC++ 2012", eosDate: "2023-01-10", eolDate: "2023-01-10" },
      { versionPattern: /2013|12\.0/i, versionLabel: "VC++ 2013", eosDate: "2024-04-09", eolDate: "2024-04-09" },
      { versionPattern: /201[5-9]|202[0-9]|14\.0/i, versionLabel: "VC++ 2015-2022", eosDate: null, eolDate: null },
    ],
  },

  // === JAVA ===
  {
    pattern: /java\s*(se|runtime|jdk|jre|\d)|openjdk|oracle\s*jdk/i,
    product: "Java",
    vendor: "Oracle",
    versions: [
      { versionPattern: /java\s*(se\s*)?6|1\.6\./i, versionLabel: "Java 6", eosDate: "2013-02-01", eolDate: "2018-12-01" },
      { versionPattern: /java\s*(se\s*)?7|1\.7\./i, versionLabel: "Java 7", eosDate: "2015-04-01", eolDate: "2022-07-01" },
      { versionPattern: /java\s*(se\s*)?8|1\.8\./i, versionLabel: "Java 8", eosDate: "2022-03-01", eolDate: "2030-12-01" },
      { versionPattern: /java\s*(se\s*)?9(?!\d)/i, versionLabel: "Java 9", eosDate: "2018-03-01", eolDate: "2018-03-01" },
      { versionPattern: /java\s*(se\s*)?10(?!\d)/i, versionLabel: "Java 10", eosDate: "2018-09-01", eolDate: "2018-09-01" },
      { versionPattern: /java\s*(se\s*)?11(?!\d)/i, versionLabel: "Java 11 (LTS)", eosDate: "2023-09-01", eolDate: "2032-01-01" },
      { versionPattern: /java\s*(se\s*)?12(?!\d)/i, versionLabel: "Java 12", eosDate: "2019-09-01", eolDate: "2019-09-01" },
      { versionPattern: /java\s*(se\s*)?13(?!\d)/i, versionLabel: "Java 13", eosDate: "2020-03-01", eolDate: "2020-03-01" },
      { versionPattern: /java\s*(se\s*)?14(?!\d)/i, versionLabel: "Java 14", eosDate: "2020-09-01", eolDate: "2020-09-01" },
      { versionPattern: /java\s*(se\s*)?15(?!\d)/i, versionLabel: "Java 15", eosDate: "2021-03-01", eolDate: "2021-03-01" },
      { versionPattern: /java\s*(se\s*)?16(?!\d)/i, versionLabel: "Java 16", eosDate: "2021-09-01", eolDate: "2021-09-01" },
      { versionPattern: /java\s*(se\s*)?17(?!\d)/i, versionLabel: "Java 17 (LTS)", eosDate: "2026-09-01", eolDate: "2029-09-01" },
      { versionPattern: /java\s*(se\s*)?18(?!\d)/i, versionLabel: "Java 18", eosDate: "2022-09-01", eolDate: "2022-09-01" },
      { versionPattern: /java\s*(se\s*)?19(?!\d)/i, versionLabel: "Java 19", eosDate: "2023-03-01", eolDate: "2023-03-01" },
      { versionPattern: /java\s*(se\s*)?20(?!\d)/i, versionLabel: "Java 20", eosDate: "2023-09-01", eolDate: "2023-09-01" },
      { versionPattern: /java\s*(se\s*)?21(?!\d)/i, versionLabel: "Java 21 (LTS)", eosDate: "2028-09-01", eolDate: "2031-09-01" },
    ],
  },

  // === WEB BROWSERS ===
  {
    pattern: /google\s*chrome/i,
    product: "Google Chrome",
    vendor: "Google",
    versions: [
      { versionPattern: /^([0-9]{1,2})\./i, versionLabel: "Chrome (old)", eosDate: "2020-01-01", eolDate: "2020-01-01", successor: "Chrome Latest" },
      { versionPattern: /^(1[0-1][0-9])\./i, versionLabel: "Chrome (recent)", eosDate: null, eolDate: null },
    ],
    defaultEosDate: null,
    defaultEolDate: null,
  },
  {
    pattern: /mozilla\s*firefox/i,
    product: "Mozilla Firefox",
    vendor: "Mozilla",
    versions: [
      { versionPattern: /esr\s*(78|91|102)/i, versionLabel: "Firefox ESR (old)", eosDate: "2023-09-01", eolDate: "2023-09-01" },
      { versionPattern: /esr\s*(115)/i, versionLabel: "Firefox ESR 115", eosDate: "2025-03-01", eolDate: "2025-03-01" },
      { versionPattern: /esr\s*(128)/i, versionLabel: "Firefox ESR 128", eosDate: null, eolDate: null },
    ],
    defaultEosDate: null,
    defaultEolDate: null,
  },
  {
    pattern: /internet\s*explorer/i,
    product: "Internet Explorer",
    vendor: "Microsoft",
    versions: [
      { versionPattern: /.*/, versionLabel: "Internet Explorer", eosDate: "2022-06-15", eolDate: "2023-02-14", successor: "Microsoft Edge" },
    ],
  },
  {
    pattern: /microsoft\s*edge/i,
    product: "Microsoft Edge",
    vendor: "Microsoft",
    versions: [],
    defaultEosDate: null,
    defaultEolDate: null,
  },

  // === ADOBE PRODUCTS ===
  {
    pattern: /adobe/i,
    product: "Adobe",
    vendor: "Adobe",
    versions: [
      { versionPattern: /acrobat.*(?:reader\s*)?(9|X|10)/i, versionLabel: "Acrobat/Reader X", eosDate: "2015-11-15", eolDate: "2015-11-15", successor: "Acrobat DC" },
      { versionPattern: /acrobat.*(?:reader\s*)?(XI|11)/i, versionLabel: "Acrobat/Reader XI", eosDate: "2017-10-15", eolDate: "2017-10-15", successor: "Acrobat DC" },
      { versionPattern: /acrobat.*2017/i, versionLabel: "Acrobat 2017", eosDate: "2022-06-06", eolDate: "2022-06-06", successor: "Acrobat DC" },
      { versionPattern: /acrobat.*2020/i, versionLabel: "Acrobat 2020", eosDate: "2025-06-01", eolDate: "2025-06-01", successor: "Acrobat DC" },
      { versionPattern: /acrobat.*(dc|continuous)/i, versionLabel: "Acrobat DC", eosDate: null, eolDate: null },
      { versionPattern: /flash/i, versionLabel: "Adobe Flash Player", eosDate: "2020-12-31", eolDate: "2020-12-31" },
      { versionPattern: /creative\s*suite|cs[3-6]/i, versionLabel: "Adobe Creative Suite", eosDate: "2017-01-01", eolDate: "2017-01-01", successor: "Creative Cloud" },
      { versionPattern: /creative\s*cloud|cc/i, versionLabel: "Adobe Creative Cloud", eosDate: null, eolDate: null },
    ],
  },

  // === SQL SERVER ===
  {
    pattern: /sql\s*server/i,
    product: "Microsoft SQL Server",
    vendor: "Microsoft",
    versions: [
      { versionPattern: /2005|9\.0/i, versionLabel: "SQL Server 2005", eosDate: "2011-04-12", eolDate: "2016-04-12" },
      { versionPattern: /2008\s*r2|10\.50/i, versionLabel: "SQL Server 2008 R2", eosDate: "2014-07-08", eolDate: "2019-07-09" },
      { versionPattern: /2008(?!\s*r2)|10\.0/i, versionLabel: "SQL Server 2008", eosDate: "2014-07-08", eolDate: "2019-07-09" },
      { versionPattern: /2012|11\.0/i, versionLabel: "SQL Server 2012", eosDate: "2017-07-11", eolDate: "2022-07-12" },
      { versionPattern: /2014|12\.0/i, versionLabel: "SQL Server 2014", eosDate: "2019-07-09", eolDate: "2024-07-09" },
      { versionPattern: /2016|13\.0/i, versionLabel: "SQL Server 2016", eosDate: "2021-07-13", eolDate: "2026-07-14" },
      { versionPattern: /2017|14\.0/i, versionLabel: "SQL Server 2017", eosDate: "2022-10-11", eolDate: "2027-10-12" },
      { versionPattern: /2019|15\.0/i, versionLabel: "SQL Server 2019", eosDate: "2025-01-07", eolDate: "2030-01-08" },
      { versionPattern: /2022|16\.0/i, versionLabel: "SQL Server 2022", eosDate: "2028-01-11", eolDate: "2033-01-11" },
    ],
  },

  // === ORACLE DATABASE ===
  {
    pattern: /oracle\s*(database|db|\d)/i,
    product: "Oracle Database",
    vendor: "Oracle",
    versions: [
      { versionPattern: /11g|11\.\d/i, versionLabel: "Oracle 11g", eosDate: "2015-01-01", eolDate: "2022-12-31" },
      { versionPattern: /12c|12\.\d/i, versionLabel: "Oracle 12c", eosDate: "2019-07-01", eolDate: "2025-03-31" },
      { versionPattern: /18c|18\.\d/i, versionLabel: "Oracle 18c", eosDate: "2021-06-01", eolDate: "2024-06-30" },
      { versionPattern: /19c|19\.\d/i, versionLabel: "Oracle 19c", eosDate: "2024-04-30", eolDate: "2027-04-30" },
      { versionPattern: /21c|21\.\d/i, versionLabel: "Oracle 21c", eosDate: "2024-04-30", eolDate: "2024-04-30" },
      { versionPattern: /23/i, versionLabel: "Oracle 23ai", eosDate: null, eolDate: null },
    ],
  },

  // === MYSQL ===
  {
    pattern: /mysql/i,
    product: "MySQL",
    vendor: "Oracle",
    versions: [
      { versionPattern: /5\.5/i, versionLabel: "MySQL 5.5", eosDate: "2015-12-01", eolDate: "2018-12-01" },
      { versionPattern: /5\.6/i, versionLabel: "MySQL 5.6", eosDate: "2018-02-01", eolDate: "2021-02-01" },
      { versionPattern: /5\.7/i, versionLabel: "MySQL 5.7", eosDate: "2020-10-01", eolDate: "2023-10-01" },
      { versionPattern: /8\.0/i, versionLabel: "MySQL 8.0", eosDate: "2025-04-30", eolDate: "2026-04-30" },
      { versionPattern: /8\.[1-4]|9\./i, versionLabel: "MySQL 8.x/9.x", eosDate: null, eolDate: null },
    ],
  },

  // === POSTGRESQL ===
  {
    pattern: /postgres/i,
    product: "PostgreSQL",
    vendor: "PostgreSQL Global Development Group",
    versions: [
      { versionPattern: /9\.[0-3]/i, versionLabel: "PostgreSQL 9.0-9.3", eosDate: "2018-11-08", eolDate: "2018-11-08" },
      { versionPattern: /9\.4/i, versionLabel: "PostgreSQL 9.4", eosDate: "2020-02-13", eolDate: "2020-02-13" },
      { versionPattern: /9\.5/i, versionLabel: "PostgreSQL 9.5", eosDate: "2021-02-11", eolDate: "2021-02-11" },
      { versionPattern: /9\.6/i, versionLabel: "PostgreSQL 9.6", eosDate: "2021-11-11", eolDate: "2021-11-11" },
      { versionPattern: /10(?!\.)/i, versionLabel: "PostgreSQL 10", eosDate: "2022-11-10", eolDate: "2022-11-10" },
      { versionPattern: /11(?!\.)/i, versionLabel: "PostgreSQL 11", eosDate: "2023-11-09", eolDate: "2023-11-09" },
      { versionPattern: /12/i, versionLabel: "PostgreSQL 12", eosDate: "2024-11-14", eolDate: "2024-11-14" },
      { versionPattern: /13/i, versionLabel: "PostgreSQL 13", eosDate: "2025-11-13", eolDate: "2025-11-13" },
      { versionPattern: /14/i, versionLabel: "PostgreSQL 14", eosDate: "2026-11-12", eolDate: "2026-11-12" },
      { versionPattern: /15/i, versionLabel: "PostgreSQL 15", eosDate: "2027-11-11", eolDate: "2027-11-11" },
      { versionPattern: /16/i, versionLabel: "PostgreSQL 16", eosDate: "2028-11-09", eolDate: "2028-11-09" },
      { versionPattern: /17/i, versionLabel: "PostgreSQL 17", eosDate: null, eolDate: null },
    ],
  },

  // === VMWARE ===
  {
    pattern: /vmware|vsphere|esxi|vcenter/i,
    product: "VMware",
    vendor: "Broadcom (VMware)",
    versions: [
      { versionPattern: /5\.5|esxi\s*5\.5/i, versionLabel: "vSphere/ESXi 5.5", eosDate: "2018-09-19", eolDate: "2020-09-19" },
      { versionPattern: /6\.0|esxi\s*6\.0/i, versionLabel: "vSphere/ESXi 6.0", eosDate: "2020-03-12", eolDate: "2022-03-12" },
      { versionPattern: /6\.5|esxi\s*6\.5/i, versionLabel: "vSphere/ESXi 6.5", eosDate: "2022-10-15", eolDate: "2024-11-15" },
      { versionPattern: /6\.7|esxi\s*6\.7/i, versionLabel: "vSphere/ESXi 6.7", eosDate: "2022-10-15", eolDate: "2024-11-15" },
      { versionPattern: /7\.0|esxi\s*7\.0/i, versionLabel: "vSphere/ESXi 7.0", eosDate: "2025-04-02", eolDate: "2027-04-02" },
      { versionPattern: /8\.0|esxi\s*8\.0/i, versionLabel: "vSphere/ESXi 8.0", eosDate: null, eolDate: null },
    ],
  },

  // === LINUX DISTRIBUTIONS ===
  {
    pattern: /ubuntu|centos|red\s*hat|rhel|debian|suse|sles|oracle\s*linux|rocky|alma/i,
    product: "Linux Distribution",
    vendor: "Various",
    versions: [
      { versionPattern: /ubuntu\s*14/i, versionLabel: "Ubuntu 14.04 LTS", eosDate: "2019-04-25", eolDate: "2024-04-25" },
      { versionPattern: /ubuntu\s*16/i, versionLabel: "Ubuntu 16.04 LTS", eosDate: "2021-04-30", eolDate: "2026-04-30" },
      { versionPattern: /ubuntu\s*18/i, versionLabel: "Ubuntu 18.04 LTS", eosDate: "2023-05-31", eolDate: "2028-04-01" },
      { versionPattern: /ubuntu\s*20/i, versionLabel: "Ubuntu 20.04 LTS", eosDate: "2025-04-02", eolDate: "2030-04-02" },
      { versionPattern: /ubuntu\s*22/i, versionLabel: "Ubuntu 22.04 LTS", eosDate: "2027-04-01", eolDate: "2032-04-01" },
      { versionPattern: /ubuntu\s*24/i, versionLabel: "Ubuntu 24.04 LTS", eosDate: "2029-04-25", eolDate: "2034-04-25" },
      { versionPattern: /centos\s*6/i, versionLabel: "CentOS 6", eosDate: "2017-05-10", eolDate: "2020-11-30" },
      { versionPattern: /centos\s*7/i, versionLabel: "CentOS 7", eosDate: "2020-08-06", eolDate: "2024-06-30" },
      { versionPattern: /centos\s*8/i, versionLabel: "CentOS 8", eosDate: "2021-12-31", eolDate: "2021-12-31" },
      { versionPattern: /centos\s*stream\s*9/i, versionLabel: "CentOS Stream 9", eosDate: null, eolDate: null },
      { versionPattern: /rhel\s*7|red\s*hat.*7/i, versionLabel: "RHEL 7", eosDate: "2019-08-06", eolDate: "2024-06-30" },
      { versionPattern: /rhel\s*8|red\s*hat.*8/i, versionLabel: "RHEL 8", eosDate: "2024-05-31", eolDate: "2029-05-31" },
      { versionPattern: /rhel\s*9|red\s*hat.*9/i, versionLabel: "RHEL 9", eosDate: "2027-05-31", eolDate: "2032-05-31" },
      { versionPattern: /debian\s*9/i, versionLabel: "Debian 9 (Stretch)", eosDate: "2020-07-06", eolDate: "2022-06-30" },
      { versionPattern: /debian\s*10/i, versionLabel: "Debian 10 (Buster)", eosDate: "2022-09-10", eolDate: "2024-06-30" },
      { versionPattern: /debian\s*11/i, versionLabel: "Debian 11 (Bullseye)", eosDate: "2024-08-01", eolDate: "2026-06-01" },
      { versionPattern: /debian\s*12/i, versionLabel: "Debian 12 (Bookworm)", eosDate: null, eolDate: null },
      { versionPattern: /sles?\s*12|suse.*12/i, versionLabel: "SLES 12", eosDate: "2024-10-31", eolDate: "2027-10-31" },
      { versionPattern: /sles?\s*15|suse.*15/i, versionLabel: "SLES 15", eosDate: null, eolDate: null },
    ],
  },

  // === SECURITY PRODUCTS ===
  {
    pattern: /symantec|norton/i,
    product: "Symantec/Norton",
    vendor: "Broadcom",
    versions: [
      { versionPattern: /endpoint\s*protection\s*1[12]/i, versionLabel: "SEP 11/12", eosDate: "2015-01-05", eolDate: "2019-01-05" },
      { versionPattern: /endpoint\s*protection\s*14\.0/i, versionLabel: "SEP 14.0", eosDate: "2020-01-06", eolDate: "2022-01-06" },
      { versionPattern: /endpoint\s*protection\s*14\.[23]/i, versionLabel: "SEP 14.2/14.3", eosDate: null, eolDate: null },
    ],
    defaultEosDate: null,
    defaultEolDate: null,
  },

  // === PYTHON ===
  {
    pattern: /python/i,
    product: "Python",
    vendor: "Python Software Foundation",
    versions: [
      { versionPattern: /2\.7/i, versionLabel: "Python 2.7", eosDate: "2020-01-01", eolDate: "2020-01-01", successor: "Python 3.x" },
      { versionPattern: /3\.6/i, versionLabel: "Python 3.6", eosDate: "2021-12-23", eolDate: "2021-12-23" },
      { versionPattern: /3\.7/i, versionLabel: "Python 3.7", eosDate: "2023-06-27", eolDate: "2023-06-27" },
      { versionPattern: /3\.8/i, versionLabel: "Python 3.8", eosDate: "2024-10-07", eolDate: "2024-10-07" },
      { versionPattern: /3\.9/i, versionLabel: "Python 3.9", eosDate: "2025-10-05", eolDate: "2025-10-05" },
      { versionPattern: /3\.10/i, versionLabel: "Python 3.10", eosDate: "2026-10-04", eolDate: "2026-10-04" },
      { versionPattern: /3\.11/i, versionLabel: "Python 3.11", eosDate: "2027-10-24", eolDate: "2027-10-24" },
      { versionPattern: /3\.12/i, versionLabel: "Python 3.12", eosDate: "2028-10-02", eolDate: "2028-10-02" },
      { versionPattern: /3\.13/i, versionLabel: "Python 3.13", eosDate: null, eolDate: null },
    ],
  },

  // === NODE.JS ===
  {
    pattern: /node\.?js|node\s/i,
    product: "Node.js",
    vendor: "OpenJS Foundation",
    versions: [
      { versionPattern: /\b8\b/i, versionLabel: "Node.js 8", eosDate: "2019-12-31", eolDate: "2019-12-31" },
      { versionPattern: /\b10\b/i, versionLabel: "Node.js 10", eosDate: "2021-04-30", eolDate: "2021-04-30" },
      { versionPattern: /\b12\b/i, versionLabel: "Node.js 12", eosDate: "2022-04-30", eolDate: "2022-04-30" },
      { versionPattern: /\b14\b/i, versionLabel: "Node.js 14", eosDate: "2023-04-30", eolDate: "2023-04-30" },
      { versionPattern: /\b16\b/i, versionLabel: "Node.js 16", eosDate: "2023-09-11", eolDate: "2023-09-11" },
      { versionPattern: /\b18\b/i, versionLabel: "Node.js 18", eosDate: "2025-04-30", eolDate: "2025-04-30" },
      { versionPattern: /\b20\b/i, versionLabel: "Node.js 20", eosDate: "2026-04-30", eolDate: "2026-04-30" },
      { versionPattern: /\b22\b/i, versionLabel: "Node.js 22", eosDate: null, eolDate: null },
    ],
  },

  // === CISCO IOS ===
  {
    pattern: /cisco/i,
    product: "Cisco",
    vendor: "Cisco",
    versions: [
      { versionPattern: /anyconnect\s*4\.[0-8]/i, versionLabel: "AnyConnect 4.x", eosDate: "2024-03-31", eolDate: "2025-03-31", successor: "Cisco Secure Client" },
      { versionPattern: /secure\s*client/i, versionLabel: "Cisco Secure Client", eosDate: null, eolDate: null },
    ],
    defaultEosDate: null,
    defaultEolDate: null,
  },

  // === APACHE ===
  {
    pattern: /apache\s*(http|tomcat|struts)/i,
    product: "Apache",
    vendor: "Apache Software Foundation",
    versions: [
      { versionPattern: /tomcat\s*[67]/i, versionLabel: "Tomcat 6/7", eosDate: "2018-04-01", eolDate: "2021-03-31" },
      { versionPattern: /tomcat\s*8\.0/i, versionLabel: "Tomcat 8.0", eosDate: "2018-06-30", eolDate: "2018-06-30" },
      { versionPattern: /tomcat\s*8\.5/i, versionLabel: "Tomcat 8.5", eosDate: "2024-03-31", eolDate: "2024-03-31" },
      { versionPattern: /tomcat\s*9/i, versionLabel: "Tomcat 9", eosDate: null, eolDate: null },
      { versionPattern: /tomcat\s*10/i, versionLabel: "Tomcat 10", eosDate: null, eolDate: null },
      { versionPattern: /struts\s*1/i, versionLabel: "Struts 1", eosDate: "2013-04-01", eolDate: "2013-04-01", successor: "Struts 2" },
    ],
  },

  // === 7-ZIP / WinRAR ===
  {
    pattern: /7[\-\s]?zip|winrar|winzip/i,
    product: "Compression Tools",
    vendor: "Various",
    versions: [],
    defaultEosDate: null,
    defaultEolDate: null,
  },

  // === TREND MICRO ===
  {
    pattern: /trend\s*micro|officescan|apex\s*one/i,
    product: "Trend Micro",
    vendor: "Trend Micro",
    versions: [
      { versionPattern: /officescan\s*xg/i, versionLabel: "OfficeScan XG", eosDate: "2019-09-30", eolDate: "2024-09-30", successor: "Apex One" },
      { versionPattern: /apex\s*one\s*2019/i, versionLabel: "Apex One 2019", eosDate: "2024-07-01", eolDate: "2026-01-31" },
      { versionPattern: /apex\s*one/i, versionLabel: "Apex One", eosDate: null, eolDate: null },
      { versionPattern: /worry[\-\s]?free\s*(business\s*)?security\s*(agent\s*)?(9|10)\./i, versionLabel: "Worry-Free Business Security 9/10", eosDate: "2023-07-15", eolDate: "2025-01-31" },
    ],
  },

  // === KASPERSKY ===
  {
    pattern: /kaspersky/i,
    product: "Kaspersky",
    vendor: "Kaspersky",
    versions: [
      { versionPattern: /endpoint\s*security\s*(10|11\.0)/i, versionLabel: "KES 10/11.0", eosDate: "2022-06-30", eolDate: "2024-06-30" },
      { versionPattern: /endpoint\s*security\s*(11\.[1-9]|12)/i, versionLabel: "KES 11.x/12", eosDate: null, eolDate: null },
    ],
    defaultEosDate: null,
    defaultEolDate: null,
  },

  // === SOPHOS ===
  {
    pattern: /sophos/i,
    product: "Sophos",
    vendor: "Sophos",
    versions: [
      { versionPattern: /endpoint\s*(protection\s*)?(9|10)/i, versionLabel: "Sophos Endpoint 9/10", eosDate: "2020-07-01", eolDate: "2023-07-20" },
      { versionPattern: /intercept\s*x/i, versionLabel: "Sophos Intercept X", eosDate: null, eolDate: null },
    ],
    defaultEosDate: null,
    defaultEolDate: null,
  },

  // === PALO ALTO ===
  {
    pattern: /palo\s*alto|cortex/i,
    product: "Palo Alto Networks",
    vendor: "Palo Alto Networks",
    versions: [
      { versionPattern: /cortex\s*xdr\s*[45]/i, versionLabel: "Cortex XDR Agent 4/5", eosDate: "2022-06-01", eolDate: "2023-12-01" },
      { versionPattern: /cortex\s*xdr\s*[78]/i, versionLabel: "Cortex XDR Agent 7/8", eosDate: null, eolDate: null },
      { versionPattern: /pan[\-\s]*os\s*[89]/i, versionLabel: "PAN-OS 8/9", eosDate: "2022-03-01", eolDate: "2024-03-01" },
      { versionPattern: /pan[\-\s]*os\s*10/i, versionLabel: "PAN-OS 10", eosDate: "2025-07-01", eolDate: "2027-07-01" },
      { versionPattern: /pan[\-\s]*os\s*11/i, versionLabel: "PAN-OS 11", eosDate: null, eolDate: null },
    ],
    defaultEosDate: null,
    defaultEolDate: null,
  },
];

export function lookupEOL(softwareName: string, version: string): EOLResult | null {
  const combined = `${softwareName} ${version}`.trim();

  for (const entry of EOL_DATABASE) {
    if (!entry.pattern.test(softwareName) && !entry.pattern.test(combined)) continue;

    for (const ver of entry.versions) {
      if (ver.versionPattern.test(combined) || ver.versionPattern.test(version) || ver.versionPattern.test(softwareName)) {
        return {
          product: entry.product,
          vendor: entry.vendor,
          versionLabel: ver.versionLabel,
          eosDate: ver.eosDate,
          eolDate: ver.eolDate,
          eosStatus: getStatus(ver.eosDate),
          eolStatus: getStatus(ver.eolDate),
          successor: ver.successor,
        };
      }
    }

    if (entry.defaultEosDate !== undefined || entry.defaultEolDate !== undefined) {
      return {
        product: entry.product,
        vendor: entry.vendor,
        versionLabel: version || "Current",
        eosDate: entry.defaultEosDate || null,
        eolDate: entry.defaultEolDate || null,
        eosStatus: getStatus(entry.defaultEosDate || null),
        eolStatus: getStatus(entry.defaultEolDate || null),
      };
    }
  }

  return null;
}

export function enrichSoftwareWithEOL(software: Array<{ name: string; version: string; systemCount: number; systems: any[] }>): Array<{
  name: string;
  version: string;
  systemCount: number;
  systems: any[];
  eol?: EOLResult;
}> {
  return software.map(sw => {
    const eol = lookupEOL(sw.name, sw.version);
    return { ...sw, eol: eol || undefined };
  });
}

export function getEOLSummary(software: Array<{ eol?: EOLResult; systemCount: number }>): {
  totalWithEOLData: number;
  eolEnded: number;
  eolApproaching: number;
  eolActive: number;
  eosEnded: number;
  eosApproaching: number;
  eosActive: number;
  eolEndedSystems: number;
  eolApproachingSystems: number;
  eosEndedSystems: number;
  eosApproachingSystems: number;
  byVendor: Array<{ vendor: string; total: number; eolEnded: number; eosEnded: number }>;
  criticalItems: Array<{ name: string; version: string; eolDate: string | null; eosDate: string | null; eolStatus: string; eosStatus: string; systemCount: number; successor?: string }>;
} {
  let totalWithEOLData = 0, eolEnded = 0, eolApproaching = 0, eolActive = 0;
  let eosEnded = 0, eosApproaching = 0, eosActive = 0;
  let eolEndedSystems = 0, eolApproachingSystems = 0, eosEndedSystems = 0, eosApproachingSystems = 0;

  const vendorMap = new Map<string, { total: number; eolEnded: number; eosEnded: number }>();
  const criticalItems: any[] = [];

  for (const sw of software) {
    if (!sw.eol) continue;
    totalWithEOLData++;

    const v = vendorMap.get(sw.eol.vendor) || { total: 0, eolEnded: 0, eosEnded: 0 };
    v.total++;

    switch (sw.eol.eolStatus) {
      case "ended": eolEnded++; eolEndedSystems += sw.systemCount; v.eolEnded++; break;
      case "approaching": eolApproaching++; eolApproachingSystems += sw.systemCount; break;
      case "active": eolActive++; break;
    }
    switch (sw.eol.eosStatus) {
      case "ended": eosEnded++; eosEndedSystems += sw.systemCount; v.eosEnded++; break;
      case "approaching": eosApproaching++; eosApproachingSystems += sw.systemCount; break;
      case "active": eosActive++; break;
    }
    vendorMap.set(sw.eol.vendor, v);

    if (sw.eol.eolStatus === "ended" || sw.eol.eosStatus === "ended" || sw.eol.eolStatus === "approaching") {
      criticalItems.push({
        name: (sw as any).name,
        version: (sw as any).version,
        eolDate: sw.eol.eolDate,
        eosDate: sw.eol.eosDate,
        eolStatus: sw.eol.eolStatus,
        eosStatus: sw.eol.eosStatus,
        systemCount: sw.systemCount,
        successor: sw.eol.successor,
        product: sw.eol.product,
        vendor: sw.eol.vendor,
        versionLabel: sw.eol.versionLabel,
      });
    }
  }

  const byVendor = Array.from(vendorMap.entries())
    .map(([vendor, data]) => ({ vendor, ...data }))
    .sort((a, b) => b.eolEnded - a.eolEnded);

  criticalItems.sort((a, b) => b.systemCount - a.systemCount);

  return {
    totalWithEOLData,
    eolEnded, eolApproaching, eolActive,
    eosEnded, eosApproaching, eosActive,
    eolEndedSystems, eolApproachingSystems,
    eosEndedSystems, eosApproachingSystems,
    byVendor,
    criticalItems: criticalItems.slice(0, 50),
  };
}
