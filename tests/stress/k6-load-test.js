/**
 * Cyber Command Center — k6 Stress & Load Test Suite
 *
 * Scenarios:
 *   smoke      — 2 VUs, 1 min    — sanity check, no errors expected
 *   load       — ramp to 50 VUs  — normal production load
 *   stress     — ramp to 200 VUs — find the breaking point
 *   spike      — spike to 500 VUs then drop — resilience test
 *   soak       — 20 VUs, 30 min  — memory leak / degradation over time
 *
 * Usage:
 *   # Install k6: https://k6.io/docs/getting-started/installation/
 *
 *   # Smoke test (quick sanity)
 *   BASE_URL=http://localhost:5000 k6 run --env SCENARIO=smoke tests/stress/k6-load-test.js
 *
 *   # Load test
 *   BASE_URL=http://localhost:5000 k6 run --env SCENARIO=load tests/stress/k6-load-test.js
 *
 *   # Stress test
 *   BASE_URL=http://localhost:5000 k6 run --env SCENARIO=stress tests/stress/k6-load-test.js
 *
 *   # Full suite with HTML report
 *   BASE_URL=https://ccc.internal.corp k6 run \
 *     --env SCENARIO=load \
 *     --out json=tests/stress/results.json \
 *     tests/stress/k6-load-test.js
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

// ─── Configuration ──────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || "http://localhost:5000";
const ADMIN_USER = __ENV.ADMIN_USER || "admin";
const ADMIN_PASS = __ENV.ADMIN_PASS || "Admin@123";
const SCENARIO = __ENV.SCENARIO || "smoke";

// ─── Custom Metrics ──────────────────────────────────────────────────────────

const authErrors = new Counter("auth_errors");
const apiErrors = new Counter("api_errors");
const errorRate = new Rate("error_rate");
const dashboardLoadTime = new Trend("dashboard_load_time", true);
const eventsLoadTime = new Trend("events_load_time", true);
const incidentsLoadTime = new Trend("incidents_load_time", true);
const casesLoadTime = new Trend("cases_load_time", true);

// ─── Thresholds ──────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    smoke: {
      executor: "constant-vus",
      vus: 2,
      duration: "1m",
      startTime: SCENARIO === "smoke" ? "0s" : "9999h",
    },
    load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 10 },
        { duration: "5m", target: 50 },
        { duration: "10m", target: 50 },
        { duration: "2m", target: 0 },
      ],
      startTime: SCENARIO === "load" ? "0s" : "9999h",
    },
    stress: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "2m", target: 50 },
        { duration: "3m", target: 100 },
        { duration: "3m", target: 200 },
        { duration: "3m", target: 300 },
        { duration: "3m", target: 200 },
        { duration: "2m", target: 0 },
      ],
      startTime: SCENARIO === "stress" ? "0s" : "9999h",
    },
    spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 10 },
        { duration: "30s", target: 500 },
        { duration: "1m", target: 500 },
        { duration: "30s", target: 10 },
        { duration: "3m", target: 10 },
        { duration: "1m", target: 0 },
      ],
      startTime: SCENARIO === "spike" ? "0s" : "9999h",
    },
    soak: {
      executor: "constant-vus",
      vus: 20,
      duration: "30m",
      startTime: SCENARIO === "soak" ? "0s" : "9999h",
    },
  },
  thresholds: {
    http_req_duration: [
      "p(95)<2000",
      "p(99)<5000",
    ],
    http_req_failed: ["rate<0.02"],
    error_rate: ["rate<0.02"],
    auth_errors: ["count<5"],
    dashboard_load_time: ["p(95)<3000"],
    events_load_time: ["p(95)<3000"],
    incidents_load_time: ["p(95)<2500"],
    cases_load_time: ["p(95)<2500"],
  },
};

// ─── Session Management ───────────────────────────────────────────────────────

let sessionCookies = null;

function login() {
  const res = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
    {
      headers: { "Content-Type": "application/json" },
      redirects: 0,
    }
  );

  const ok = check(res, {
    "login returns 200": (r) => r.status === 200,
    "login returns user object": (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.username || body.id;
      } catch {
        return false;
      }
    },
  });

  if (!ok) {
    authErrors.add(1);
    return null;
  }

  return res.cookies;
}

function apiGet(path, trend) {
  const start = Date.now();
  const res = http.get(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    cookies: sessionCookies,
  });
  const duration = Date.now() - start;

  if (trend) trend.add(duration);

  const ok = check(res, {
    [`GET ${path} status 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`GET ${path} has body`]: (r) => r.body && r.body.length > 0,
  });

  if (!ok) {
    apiErrors.add(1);
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }

  return res;
}

// ─── Setup ───────────────────────────────────────────────────────────────────

export function setup() {
  const cookies = login();
  if (!cookies) {
    console.error("Setup failed: could not login");
    return { sessionCookies: null };
  }
  return { sessionCookies: cookies };
}

// ─── Default Test Function ────────────────────────────────────────────────────

export default function (data) {
  sessionCookies = data.sessionCookies;

  if (!sessionCookies) {
    const cookies = login();
    if (!cookies) return;
    sessionCookies = cookies;
  }

  const tenant = "30";

  group("Health Check", () => {
    const res = http.get(`${BASE_URL}/healthz`);
    check(res, {
      "healthz 200": (r) => r.status === 200,
    });
  });

  group("Dashboard & Overview", () => {
    apiGet(`/api/incidents?tenantId=${tenant}&limit=20`, dashboardLoadTime);
    sleep(0.5);
    apiGet(`/api/incidents/stats?tenantId=${tenant}`, null);
    sleep(0.3);
  });

  group("Security Events", () => {
    apiGet(`/api/security-events?tenantId=${tenant}&limit=50`, eventsLoadTime);
    sleep(0.5);
    apiGet(`/api/security-events/stats?tenantId=${tenant}`, null);
    sleep(0.3);
  });

  group("Incidents", () => {
    apiGet(`/api/incidents?tenantId=${tenant}&limit=20`, incidentsLoadTime);
    sleep(0.4);
  });

  group("Cases", () => {
    apiGet(`/api/cases?tenantId=${tenant}&limit=20`, casesLoadTime);
    sleep(0.3);
  });

  group("Tickets & Projects", () => {
    apiGet(`/api/tickets?tenantId=${tenant}&limit=20`, null);
    sleep(0.3);
    apiGet(`/api/projects?tenantId=${tenant}&limit=10`, null);
    sleep(0.3);
  });

  group("Assets (CAASM)", () => {
    apiGet(`/api/assets?tenantId=${tenant}&limit=50`, null);
    sleep(0.5);
  });

  group("Threat Intelligence", () => {
    apiGet(`/api/threat-intel/feeds?tenantId=${tenant}`, null);
    sleep(0.3);
  });

  group("Platform Health", () => {
    apiGet("/api/admin/platform-health", null);
    sleep(0.2);
  });

  sleep(1 + Math.random() * 2);
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log("Load test complete.");
}
