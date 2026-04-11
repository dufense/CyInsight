export interface CountryCentroid {
  code: string;
  name: string;
  lat: number;
  lon: number;
  flag: string;
}

export const COUNTRY_CENTROIDS: CountryCentroid[] = [
  { code: "AF", name: "Afghanistan", lat: 33.9391, lon: 67.7100, flag: "🇦🇫" },
  { code: "AL", name: "Albania", lat: 41.1533, lon: 20.1683, flag: "🇦🇱" },
  { code: "DZ", name: "Algeria", lat: 28.0339, lon: 1.6596, flag: "🇩🇿" },
  { code: "AO", name: "Angola", lat: -11.2027, lon: 17.8739, flag: "🇦🇴" },
  { code: "AR", name: "Argentina", lat: -38.4161, lon: -63.6167, flag: "🇦🇷" },
  { code: "AU", name: "Australia", lat: -25.2744, lon: 133.7751, flag: "🇦🇺" },
  { code: "AT", name: "Austria", lat: 47.5162, lon: 14.5501, flag: "🇦🇹" },
  { code: "AZ", name: "Azerbaijan", lat: 40.1431, lon: 47.5769, flag: "🇦🇿" },
  { code: "BH", name: "Bahrain", lat: 26.0667, lon: 50.5577, flag: "🇧🇭" },
  { code: "BD", name: "Bangladesh", lat: 23.6850, lon: 90.3563, flag: "🇧🇩" },
  { code: "BY", name: "Belarus", lat: 53.7098, lon: 27.9534, flag: "🇧🇾" },
  { code: "BE", name: "Belgium", lat: 50.5039, lon: 4.4699, flag: "🇧🇪" },
  { code: "BR", name: "Brazil", lat: -14.2350, lon: -51.9253, flag: "🇧🇷" },
  { code: "BG", name: "Bulgaria", lat: 42.7339, lon: 25.4858, flag: "🇧🇬" },
  { code: "CA", name: "Canada", lat: 56.1304, lon: -106.3468, flag: "🇨🇦" },
  { code: "CL", name: "Chile", lat: -35.6751, lon: -71.5430, flag: "🇨🇱" },
  { code: "CN", name: "China", lat: 35.8617, lon: 104.1954, flag: "🇨🇳" },
  { code: "CO", name: "Colombia", lat: 4.5709, lon: -74.2973, flag: "🇨🇴" },
  { code: "CG", name: "Congo", lat: -0.2280, lon: 15.8277, flag: "🇨🇬" },
  { code: "HR", name: "Croatia", lat: 45.1, lon: 15.2, flag: "🇭🇷" },
  { code: "CY", name: "Cyprus", lat: 35.1264, lon: 33.4299, flag: "🇨🇾" },
  { code: "CZ", name: "Czech Republic", lat: 49.8175, lon: 15.4730, flag: "🇨🇿" },
  { code: "DK", name: "Denmark", lat: 56.2639, lon: 9.5018, flag: "🇩🇰" },
  { code: "EG", name: "Egypt", lat: 26.8206, lon: 30.8025, flag: "🇪🇬" },
  { code: "ET", name: "Ethiopia", lat: 9.1450, lon: 40.4897, flag: "🇪🇹" },
  { code: "FI", name: "Finland", lat: 61.9241, lon: 25.7482, flag: "🇫🇮" },
  { code: "FR", name: "France", lat: 46.2276, lon: 2.2137, flag: "🇫🇷" },
  { code: "DE", name: "Germany", lat: 51.1657, lon: 10.4515, flag: "🇩🇪" },
  { code: "GH", name: "Ghana", lat: 7.9465, lon: -1.0232, flag: "🇬🇭" },
  { code: "GR", name: "Greece", lat: 39.0742, lon: 21.8243, flag: "🇬🇷" },
  { code: "HK", name: "Hong Kong", lat: 22.3193, lon: 114.1694, flag: "🇭🇰" },
  { code: "HU", name: "Hungary", lat: 47.1625, lon: 19.5033, flag: "🇭🇺" },
  { code: "IN", name: "India", lat: 20.5937, lon: 78.9629, flag: "🇮🇳" },
  { code: "ID", name: "Indonesia", lat: -0.7893, lon: 113.9213, flag: "🇮🇩" },
  { code: "IR", name: "Iran", lat: 32.4279, lon: 53.6880, flag: "🇮🇷" },
  { code: "IQ", name: "Iraq", lat: 33.2232, lon: 43.6793, flag: "🇮🇶" },
  { code: "IE", name: "Ireland", lat: 53.1424, lon: -7.6921, flag: "🇮🇪" },
  { code: "IL", name: "Israel", lat: 31.0461, lon: 34.8516, flag: "🇮🇱" },
  { code: "IT", name: "Italy", lat: 41.8719, lon: 12.5674, flag: "🇮🇹" },
  { code: "JP", name: "Japan", lat: 36.2048, lon: 138.2529, flag: "🇯🇵" },
  { code: "JO", name: "Jordan", lat: 30.5852, lon: 36.2384, flag: "🇯🇴" },
  { code: "KZ", name: "Kazakhstan", lat: 48.0196, lon: 66.9237, flag: "🇰🇿" },
  { code: "KE", name: "Kenya", lat: -0.0236, lon: 37.9062, flag: "🇰🇪" },
  { code: "KR", name: "South Korea", lat: 35.9078, lon: 127.7669, flag: "🇰🇷" },
  { code: "KW", name: "Kuwait", lat: 29.3117, lon: 47.4818, flag: "🇰🇼" },
  { code: "LB", name: "Lebanon", lat: 33.8547, lon: 35.8623, flag: "🇱🇧" },
  { code: "LY", name: "Libya", lat: 26.3351, lon: 17.2283, flag: "🇱🇾" },
  { code: "MY", name: "Malaysia", lat: 4.2105, lon: 101.9758, flag: "🇲🇾" },
  { code: "MX", name: "Mexico", lat: 23.6345, lon: -102.5528, flag: "🇲🇽" },
  { code: "MA", name: "Morocco", lat: 31.7917, lon: -7.0926, flag: "🇲🇦" },
  { code: "NL", name: "Netherlands", lat: 52.1326, lon: 5.2913, flag: "🇳🇱" },
  { code: "NZ", name: "New Zealand", lat: -40.9006, lon: 174.8860, flag: "🇳🇿" },
  { code: "NG", name: "Nigeria", lat: 9.0820, lon: 8.6753, flag: "🇳🇬" },
  { code: "NO", name: "Norway", lat: 60.4720, lon: 8.4689, flag: "🇳🇴" },
  { code: "OM", name: "Oman", lat: 21.4735, lon: 55.9754, flag: "🇴🇲" },
  { code: "PK", name: "Pakistan", lat: 30.3753, lon: 69.3451, flag: "🇵🇰" },
  { code: "PH", name: "Philippines", lat: 12.8797, lon: 121.7740, flag: "🇵🇭" },
  { code: "PL", name: "Poland", lat: 51.9194, lon: 19.1451, flag: "🇵🇱" },
  { code: "PT", name: "Portugal", lat: 39.3999, lon: -8.2245, flag: "🇵🇹" },
  { code: "QA", name: "Qatar", lat: 25.3548, lon: 51.1839, flag: "🇶🇦" },
  { code: "RO", name: "Romania", lat: 45.9432, lon: 24.9668, flag: "🇷🇴" },
  { code: "RU", name: "Russia", lat: 61.5240, lon: 105.3188, flag: "🇷🇺" },
  { code: "SA", name: "Saudi Arabia", lat: 23.8859, lon: 45.0792, flag: "🇸🇦" },
  { code: "SG", name: "Singapore", lat: 1.3521, lon: 103.8198, flag: "🇸🇬" },
  { code: "ZA", name: "South Africa", lat: -30.5595, lon: 22.9375, flag: "🇿🇦" },
  { code: "ES", name: "Spain", lat: 40.4637, lon: -3.7492, flag: "🇪🇸" },
  { code: "LK", name: "Sri Lanka", lat: 7.8731, lon: 80.7718, flag: "🇱🇰" },
  { code: "SE", name: "Sweden", lat: 60.1282, lon: 18.6435, flag: "🇸🇪" },
  { code: "CH", name: "Switzerland", lat: 46.8182, lon: 8.2275, flag: "🇨🇭" },
  { code: "SY", name: "Syria", lat: 34.8021, lon: 38.9968, flag: "🇸🇾" },
  { code: "TW", name: "Taiwan", lat: 23.6978, lon: 120.9605, flag: "🇹🇼" },
  { code: "TH", name: "Thailand", lat: 15.8700, lon: 100.9925, flag: "🇹🇭" },
  { code: "TN", name: "Tunisia", lat: 33.8869, lon: 9.5375, flag: "🇹🇳" },
  { code: "TR", name: "Turkey", lat: 38.9637, lon: 35.2433, flag: "🇹🇷" },
  { code: "UA", name: "Ukraine", lat: 48.3794, lon: 31.1656, flag: "🇺🇦" },
  { code: "AE", name: "UAE", lat: 23.4241, lon: 53.8478, flag: "🇦🇪" },
  { code: "GB", name: "United Kingdom", lat: 55.3781, lon: -3.4360, flag: "🇬🇧" },
  { code: "US", name: "United States", lat: 37.0902, lon: -95.7129, flag: "🇺🇸" },
  { code: "UZ", name: "Uzbekistan", lat: 41.3775, lon: 64.5853, flag: "🇺🇿" },
  { code: "VN", name: "Vietnam", lat: 14.0583, lon: 108.2772, flag: "🇻🇳" },
  { code: "YE", name: "Yemen", lat: 15.5527, lon: 48.5164, flag: "🇾🇪" },
  { code: "ZM", name: "Zambia", lat: -13.1339, lon: 27.8493, flag: "🇿🇲" },
  { code: "ZW", name: "Zimbabwe", lat: -19.0154, lon: 29.1549, flag: "🇿🇼" },
];

export const COUNTRY_MAP = new Map<string, CountryCentroid>(
  COUNTRY_CENTROIDS.map(c => [c.code, c])
);

export function toMapXY(lat: number, lon: number, width: number, height: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * width;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = (height / 2) - (width * mercN) / (2 * Math.PI);
  return { x, y };
}
