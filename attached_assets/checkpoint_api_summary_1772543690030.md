# Check Point Infinity Portal API - Summary

## Overview
The **Check Point Infinity Portal API** provides programmatic access to various Check Point cloud services including:
- Harmony Email & Collaboration (HEC)
- Harmony Endpoint
- Quantum Smart-1 Cloud
- IoT Protect
- Custom IOC Management
- MSSP/Usage Reports

---

## Authentication

### Base Authentication URL (EU Region)
```
https://cloudinfra-gw.portal.checkpoint.com/auth/external
```

### Your Credentials
| Parameter | Value |
|-----------|-------|
| **Client ID** | `6d607ba74da5454fbab0e06e66b3864b` |
| **Secret Key** | `65684dd1f4444144ae4d1f719f21d6cd` |
| **Auth URL** | `https://cloudinfra-gw.portal.checkpoint.com/auth/external` |

### Step 1: Obtain Access Token

**Endpoint:** `POST /auth/external`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
    "clientId": "6d607ba74da5454fbab0e06e66b3864b",
    "accessKey": "65684dd1f4444144ae4d1f719f21d6cd"
}
```

**cURL Example:**
```bash
curl -d '{
    "clientId":"6d607ba74da5454fbab0e06e66b3864b",
    "accessKey":"65684dd1f4444144ae4d1f719f21d6cd"
}' \
  -H "Content-Type: application/json" \
  -X POST https://cloudinfra-gw.portal.checkpoint.com/auth/external
```

**Response:**
```json
{
    "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 1800
}
```

### Step 2: Use the Token

Include the token in the `Authorization` header for all subsequent API calls:

```
Authorization: Bearer <JWT_TOKEN>
```

**Token Validity:** 30 minutes (1800 seconds)

---

## Regional Endpoints

| Region | Base URL |
|--------|----------|
| **Europe (EU)** | `https://cloudinfra-gw.portal.checkpoint.com` |
| **United States (US)** | `https://cloudinfra-gw-us.portal.checkpoint.com` |
| **Australia (AU)** | `https://cloudinfra-gw.ap.portal.checkpoint.com` |
| **Canada (CA)** | `https://cloudinfra-gw.ca.portal.checkpoint.com` |
| **United Kingdom (UK)** | `https://cloudinfra-gw.uk.portal.checkpoint.com` |
| **Middle East (ME)** | `https://cloudinfra-gw.me.portal.checkpoint.com` |
| **India (IN)** | `https://cloudinfra-gw.in.portal.checkpoint.com` |

Your credentials use the **EU region**.

---

## Available APIs

### 1. Harmony Email & Collaboration (HEC) API

**Base URL:** `https://cloudinfra-gw.portal.checkpoint.com/app/hec-api/v1.0`

**Common Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/event/{eventId}` | GET | Get security event details |
| `/events` | GET | List security events |
| `/action/entity` | POST | Perform actions (quarantine, delete, etc.) |
| `/exceptions/whitelist` | GET/POST | Manage whitelist exceptions |
| `/exceptions/blacklist` | GET/POST | Manage blacklist exceptions |
| `/task/{taskId}` | GET | Get task status |

**Example - Get Events:**
```bash
curl -X GET \
  -H "Accept: application/json" \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "x-av-req-id: $(uuidgen)" \
  "https://cloudinfra-gw.portal.checkpoint.com/app/hec-api/v1.0/events"
```

### 2. Harmony Endpoint API

**API Documentation:** https://app.swaggerhub.com/apis/Check-Point/web-mgmt-external-api-production/

**Base URL:** `https://cloudinfra-gw.portal.checkpoint.com/app/endpoint-web-mgmt-api/v1`

**Common Operations:**
- Get computers/agents
- Run forensics analysis
- Terminate processes
- File operations (copy, move, delete)
- VPN site management

### 3. Quantum Smart-1 Cloud API

**Base URL:** `https://cloudinfra-gw.portal.checkpoint.com/app/maas/api/v2`

**Common Endpoints:**
| Endpoint | Description |
|----------|-------------|
| `/environments/{envId}` | Manage environments |
| `/login` | Login to management server |
| `/show-cloud-services` | List cloud services |
| `/get-platform` | Get platform info |

### 4. Infinity Portal General API

**Base URL:** `https://cloudinfra-gw.portal.checkpoint.com/api/v1`

**Common Endpoints:**
| Endpoint | Description |
|----------|-------------|
| `/tenant/usageReport` | Get MSSP usage reports |

---

## API Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <JWT_TOKEN>` |
| `Content-Type` | Yes (POST/PUT) | `application/json` |
| `Accept` | Recommended | `application/json` |
| `x-av-req-id` | Recommended | Unique request ID (UUID) |

---

## Response Format

**Success Response Structure:**
```json
{
    "responseEnvelope": {
        "requestId": "string",
        "responseCode": 0,
        "responseText": "Success",
        "additionalText": "",
        "recordsNumber": 1,
        "totalRecordsNumber": 1,
        "scrollId": "string"
    },
    "responseData": { ... }
}
```

**Error Response:**
```json
{
    "success": false,
    "message": "Authentication required",
    "forceLogout": true
}
```

**Response Codes:**
- `0` = Success
- `401` = Authentication required
- Other values indicate specific errors

---

## Rate Limiting

- There are rate limits per account for API calls
- When exceeded, the system returns an error message
- Implement exponential backoff for retries

---

## Best Practices

1. **Token Management**
   - Store tokens securely
   - Refresh token before 30-minute expiry
   - Re-authenticate when token expires

2. **Request ID**
   - Generate unique `x-av-req-id` for each request
   - Use UUID format for traceability

3. **Error Handling**
   - Handle 401 errors by re-authenticating
   - Implement retry logic with backoff
   - Log response codes for debugging

4. **Security**
   - Never hardcode credentials in code
   - Use environment variables or secure vaults
   - Rotate API keys periodically

---

## Python Example

```python
import requests
import json

# Configuration
CLIENT_ID = "6d607ba74da5454fbab0e06e66b3864b"
SECRET_KEY = "65684dd1f4444144ae4d1f719f21d6cd"
AUTH_URL = "https://cloudinfra-gw.portal.checkpoint.com/auth/external"
BASE_URL = "https://cloudinfra-gw.portal.checkpoint.com"

# Step 1: Get Access Token
def get_access_token():
    payload = {
        "clientId": CLIENT_ID,
        "accessKey": SECRET_KEY
    }
    headers = {
        "Content-Type": "application/json"
    }
    
    response = requests.post(AUTH_URL, json=payload, headers=headers)
    response.raise_for_status()
    
    data = response.json()
    return data["token"]

# Step 2: Make API Call
def get_hec_events(token):
    url = f"{BASE_URL}/app/hec-api/v1.0/events"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "x-av-req-id": "unique-request-id-123"
    }
    
    response = requests.get(url, headers=headers)
    return response.json()

# Usage
token = get_access_token()
events = get_hec_events(token)
print(json.dumps(events, indent=2))
```

---

## References

- **Infinity Portal Admin Guide:** https://sc1.checkpoint.com/documents/Infinity_Portal/WebAdminGuides/EN/Infinity-Portal-Admin-Guide/
- **HEC API Reference:** https://sc1.checkpoint.com/documents/Harmony_Email_and_Collaboration_API_Reference/
- **Harmony Endpoint API:** https://app.swaggerhub.com/apis/Check-Point/web-mgmt-external-api-production/
- **IOC Management API:** https://sc1.checkpoint.com/documents/Infinity_Portal/WebAdminGuides/EN/IOC-Admin-Guide/

---

*Generated on: 2026-03-03*
