# Check Point Infinity Portal API - First-Time Integration Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Understanding the Architecture](#understanding-the-architecture)
3. [Step-by-Step Integration](#step-by-step-integration)
4. [Quick Start Examples](#quick-start-examples)
5. [Common Use Cases](#common-use-cases)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)
8. [Next Steps](#next-steps)

---

## Prerequisites

### What You Need Before Starting

1. **Check Point Infinity Portal Account**
   - Access to the Infinity Portal at https://portal.checkpoint.com
   - Administrator or appropriate role permissions

2. **API Credentials** (Already Provided)
   | Credential | Value | Purpose |
   |------------|-------|---------|
   | Client ID | `6d607ba74da5454fbab0e06e66b3864b` | Identifies your application |
   | Secret Key | `65684dd1f4444144ae4d1f719f21d6cd` | Authenticates your requests |
   | Auth URL | `https://cloudinfra-gw.portal.checkpoint.com/auth/external` | Token endpoint |

3. **Tools Required**
   - cURL (for testing)
   - Python 3.8+ (for scripting) or any HTTP client
   - API testing tool (Postman, Insomnia, or similar) - Optional

4. **Network Requirements**
   - Outbound HTTPS (port 443) access to `cloudinfra-gw.portal.checkpoint.com`
   - No VPN restrictions to the above domain

---

## Understanding the Architecture

### Authentication Flow

```
Your App              Check Point Auth           API Resources
   |   POST /auth/external        |                      |
   | ────────────────────────────>|                      |
   |   Client ID + Secret Key     |                      |
   |                              |    JWT Token         |
   |<─────────────────────────────|                      |
   |                              |                      |
   |   GET /app/hec-api/v1.0/events                     |
   |   Authorization: Bearer <JWT>──────────────────────>| 
   |                              |                      |
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **JWT Token** | JSON Web Token returned after authentication, valid for 30 minutes |
| **Client ID** | Public identifier for your API integration |
| **Secret Key** | Private key used only during authentication (keep secure!) |
| **Request ID** | Unique identifier for each API call (header: `x-av-req-id`) |
| **Service** | The Check Point product your API key is tied to (HEC, Endpoint, etc.) |

---

## Step-by-Step Integration

### Step 1: Verify Connectivity

Before writing code, test basic connectivity:

```bash
# Test if the authentication endpoint is reachable
curl -I https://cloudinfra-gw.portal.checkpoint.com/auth/external
```

Expected: HTTP 405 (Method Not Allowed) - The endpoint exists but requires POST

### Step 2: Authenticate and Get Token

#### Using cURL

```bash
curl -X POST \
  https://cloudinfra-gw.portal.checkpoint.com/auth/external \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "6d607ba74da5454fbab0e06e66b3864b",
    "accessKey": "65684dd1f4444144ae4d1f719f21d6cd"
  }'
```

**Expected Response:**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 1800
}
```

#### Using Python

```python
import requests

# Configuration
CLIENT_ID = "6d607ba74da5454fbab0e06e66b3864b"
SECRET_KEY = "65684dd1f4444144ae4d1f719f21d6cd"
AUTH_URL = "https://cloudinfra-gw.portal.checkpoint.com/auth/external"

# Authenticate
response = requests.post(AUTH_URL, json={
    "clientId": CLIENT_ID,
    "accessKey": SECRET_KEY
})
response.raise_for_status()

token_data = response.json()
access_token = token_data["token"]
expires_in = token_data["expires_in"]  # 1800 seconds = 30 minutes

print(f"Token obtained! Expires in {expires_in} seconds")
```

### Step 3: Make Your First API Call

#### Understanding Available Services

Your API key is configured for a specific service. The available services include:
- **Email & Collaboration** - Email security events, quarantine, exceptions
- **Harmony Endpoint** - Endpoint management, forensics, policy
- **Quantum Smart-1 Cloud** - Management API
- **IoT Protect** - IoT device security
- **Custom IOC** - Threat intelligence feeds

#### Test API Call (Generic)

```bash
# Replace <TOKEN> with your actual JWT token
curl -X GET \
  https://cloudinfra-gw.portal.checkpoint.com/api/v1/tenant \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Accept: application/json" \
  -H "x-av-req-id: $(uuidgen)"
```

### Step 4: Handle Token Expiration

Tokens expire after 30 minutes. Implement token refresh logic:

```python
import time
import requests
from datetime import datetime, timedelta

class CheckpointAPIClient:
    def __init__(self, client_id, secret_key, auth_url, base_url):
        self.client_id = client_id
        self.secret_key = secret_key
        self.auth_url = auth_url
        self.base_url = base_url
        self.token = None
        self.token_expiry = None
    
    def _get_token(self):
        """Obtain new access token."""
        response = requests.post(self.auth_url, json={
            "clientId": self.client_id,
            "accessKey": self.secret_key
        })
        response.raise_for_status()
        
        data = response.json()
        self.token = data["token"]
        # Set expiry 5 minutes before actual expiry for safety
        self.token_expiry = datetime.now() + timedelta(seconds=data["expires_in"] - 300)
        return self.token
    
    def get_valid_token(self):
        """Get valid token, refresh if needed."""
        if not self.token or datetime.now() >= self.token_expiry:
            return self._get_token()
        return self.token
    
    def request(self, method, endpoint, **kwargs):
        """Make authenticated API request."""
        token = self.get_valid_token()
        url = f"{self.base_url}{endpoint}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "x-av-req-id": str(uuid.uuid4())
        }
        
        if "json" in kwargs:
            headers["Content-Type"] = "application/json"
        
        kwargs.setdefault("headers", {}).update(headers)
        
        response = requests.request(method, url, **kwargs)
        
        # Handle token expiration during request
        if response.status_code == 401:
            self.token = None  # Force refresh
            token = self.get_valid_token()
            kwargs["headers"]["Authorization"] = f"Bearer {token}"
            response = requests.request(method, url, **kwargs)
        
        response.raise_for_status()
        return response.json()
```

---

## Quick Start Examples

### Example 1: Harmony Email & Collaboration (HEC)

```python
import requests
import uuid

# Setup
CLIENT_ID = "6d607ba74da5454fbab0e06e66b3864b"
SECRET_KEY = "65684dd1f4444144ae4d1f719f21d6cd"
AUTH_URL = "https://cloudinfra-gw.portal.checkpoint.com/auth/external"
BASE_URL = "https://cloudinfra-gw.portal.checkpoint.com"

# 1. Authenticate
auth_response = requests.post(AUTH_URL, json={
    "clientId": CLIENT_ID,
    "accessKey": SECRET_KEY
})
token = auth_response.json()["token"]

# 2. Get Security Events
headers = {
    "Authorization": f"Bearer {token}",
    "Accept": "application/json",
    "x-av-req-id": str(uuid.uuid4())
}

events_response = requests.get(
    f"{BASE_URL}/app/hec-api/v1.0/events",
    headers=headers
)

events = events_response.json()
print(f"Found {events['responseEnvelope']['totalRecordsNumber']} events")

# 3. Quarantine an Email (if needed)
quarantine_payload = {
    "requestData": {
        "entityIds": ["entity-id-here"],
        "entityActionName": "quarantine"
    }
}

action_response = requests.post(
    f"{BASE_URL}/app/hec-api/v1.0/action/entity",
    headers=headers,
    json=quarantine_payload
)
```

### Example 2: Harmony Endpoint

```python
# Get list of computers/computers
computers_response = requests.get(
    f"{BASE_URL}/app/endpoint-web-mgmt-api/v1/computers",
    headers=headers
)

computers = computers_response.json()
for computer in computers.get("data", []):
    print(f"Computer: {computer.get('name')} - {computer.get('status')}")
```

### Example 3: Custom IOC Management

```python
# Get IOC feeds
feeds_response = requests.get(
    f"{BASE_URL}/app/ioc-api/v1/feeds",
    headers=headers
)

feeds = feeds_response.json()
for feed in feeds.get("data", []):
    print(f"Feed: {feed.get('name')} ({feed.get('id')})")
```

---

## Common Use Cases

### Use Case 1: Automated Incident Response

```python
def handle_phishing_alert(event_id):
    """Automatically quarantine phishing emails."""
    # Get event details
    event = client.request("GET", f"/app/hec-api/v1.0/event/{event_id}")
    
    # Quarantine all related entities
    for entity in event["responseData"]["entities"]:
        client.request("POST", "/app/hec-api/v1.0/action/entity", json={
            "requestData": {
                "entityIds": [entity["entityId"]],
                "entityActionName": "quarantine"
            }
        })
```

### Use Case 2: Daily Security Report

```python
def generate_daily_report():
    """Generate daily security events report."""
    # Get events from last 24 hours
    events = client.request("GET", "/app/hec-api/v1.0/events")
    
    report = {
        "total_events": events["responseEnvelope"]["totalRecordsNumber"],
        "severity_breakdown": {},
        "timestamp": datetime.now().isoformat()
    }
    
    for event in events["responseData"]:
        severity = event.get("severity", "unknown")
        report["severity_breakdown"][severity] = \
            report["severity_breakdown"].get(severity, 0) + 1
    
    return report
```

### Use Case 3: IOC Feed Integration

```python
def import_threat_intelligence(indicators):
    """Import threat indicators to Check Point."""
    payload = {
        "indicators": [
            {
                "type": "ip",
                "value": indicator["ip"],
                "severity": indicator["severity"],
                "confidence": indicator["confidence"]
            }
            for indicator in indicators
        ]
    }
    
    response = client.request(
        "POST",
        "/app/ioc-api/v1/feeds/{feed_id}/indicators",
        json=payload
    )
    return response
```

---

## Troubleshooting

### Common Issues and Solutions

#### Issue 1: Authentication Fails (401 Unauthorized)

**Symptoms:**
```json
{
  "success": false,
  "message": "Authentication required",
  "forceLogout": true
}
```

**Solutions:**
1. Verify Client ID and Secret Key are correct
2. Check token hasn't expired (30-minute limit)
3. Ensure `Authorization` header format is exactly: `Bearer <token>`
4. Verify you're using the correct regional endpoint

#### Issue 2: Service Not Accessible (403 Forbidden)

**Symptoms:**
```json
{
  "success": false,
  "message": "Access denied to service"
}
```

**Solutions:**
1. Your API key was created for a specific service - verify you're using the right endpoints
2. Check if your Infinity Portal user has permissions for that service
3. Re-create API key with correct service selected

#### Issue 3: Rate Limiting (429 Too Many Requests)

**Symptoms:**
```json
{
  "success": false,
  "message": "Rate limit exceeded"
}
```

**Solutions:**
1. Implement exponential backoff between requests
2. Add request delays (e.g., 100ms between calls)
3. Batch operations when possible
4. Contact Check Point to increase rate limits

#### Issue 4: Network Connectivity Issues

**Symptoms:**
- Timeout errors
- Connection refused
- SSL certificate errors

**Solutions:**
1. Verify outbound HTTPS (port 443) is allowed
2. Check proxy settings if behind corporate firewall
3. Verify DNS resolution for `cloudinfra-gw.portal.checkpoint.com`
4. Test with: `curl -v https://cloudinfra-gw.portal.checkpoint.com/auth/external`

### Debug Checklist

```bash
# 1. Test basic connectivity
ping cloudinfra-gw.portal.checkpoint.com

# 2. Test HTTPS connection
curl -I https://cloudinfra-gw.portal.checkpoint.com/auth/external

# 3. Test authentication
curl -X POST https://cloudinfra-gw.portal.checkpoint.com/auth/external \
  -H "Content-Type: application/json" \
  -d '{"clientId":"YOUR_CLIENT_ID","accessKey":"YOUR_SECRET_KEY"}'

# 4. Decode JWT token (optional)
echo "YOUR_JWT_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq .
```

---

## Best Practices

### Security Best Practices

1. **Never Hardcode Credentials**
   ```python
   # ❌ Bad
   CLIENT_ID = "6d607ba74da5454fbab0e06e66b3864b"
   
   # ✅ Good
   import os
   CLIENT_ID = os.environ.get("CHECKPOINT_CLIENT_ID")
   SECRET_KEY = os.environ.get("CHECKPOINT_SECRET_KEY")
   ```

2. **Use Environment Variables or Secret Managers**
   ```bash
   export CHECKPOINT_CLIENT_ID="6d607ba74da5454fbab0e06e66b3864b"
   export CHECKPOINT_SECRET_KEY="65684dd1f4444144ae4d1f719f21d6cd"
   ```

3. **Implement Token Caching**
   - Don't authenticate for every request
   - Cache token until near expiration

4. **Use HTTPS Only**
   - Never send credentials over HTTP
   - Verify SSL certificates

5. **Rotate API Keys Regularly**
   - Set expiration dates on API keys
   - Rotate every 90 days recommended

### Performance Best Practices

1. **Reuse Connections**
   ```python
   # Use requests Session for connection pooling
   session = requests.Session()
   session.headers.update({"Authorization": f"Bearer {token}"})
   ```

2. **Handle Pagination**
   ```python
   def get_all_events():
       events = []
       scroll_id = None
       
       while True:
           params = {"scrollId": scroll_id} if scroll_id else {}
           response = client.request("GET", "/app/hec-api/v1.0/events", params=params)
           
           events.extend(response["responseData"])
           scroll_id = response["responseEnvelope"].get("scrollId")
           
           if not scroll_id:
               break
       
       return events
   ```

3. **Implement Retries with Backoff**
   ```python
   import time
   from functools import wraps
   
   def retry_on_error(max_retries=3, backoff_factor=2):
       def decorator(func):
           @wraps(func)
           def wrapper(*args, **kwargs):
               for attempt in range(max_retries):
                   try:
                       return func(*args, **kwargs)
                   except requests.exceptions.RequestException as e:
                       if attempt == max_retries - 1:
                           raise
                       time.sleep(backoff_factor ** attempt)
               return None
           return wrapper
       return decorator
   ```

### Code Organization

```
checkpoint-integration/
├── config/
│   └── settings.py          # Configuration management
├── client/
│   ├── __init__.py
│   └── checkpoint_client.py # API client wrapper
├── services/
│   ├── __init__.py
│   ├── hec_service.py       # HEC-specific operations
│   └── endpoint_service.py  # Endpoint-specific operations
├── utils/
│   ├── __init__.py
│   └── auth.py              # Authentication helpers
├── examples/
│   ├── basic_auth.py
│   ├── hec_events.py
│   └── endpoint_mgmt.py
└── tests/
    └── test_client.py
```

---

## Next Steps

### Immediate Actions

1. **Test Authentication**
   - Run the authentication example
   - Verify token is returned successfully

2. **Identify Your Service**
   - Determine which Check Point service your API key is for
   - Review the relevant API documentation

3. **Make First API Call**
   - Use the examples in this guide
   - Start with simple GET requests

### Documentation Resources

| Resource | URL | Description |
|----------|-----|-------------|
| Infinity Portal Admin Guide | https://sc1.checkpoint.com/documents/Infinity_Portal/WebAdminGuides/EN/Infinity-Portal-Admin-Guide/ | Portal administration |
| HEC API Reference | https://sc1.checkpoint.com/documents/Harmony_Email_and_Collaboration_API_Reference/ | Email & Collaboration API |
| Endpoint API | https://app.swaggerhub.com/apis/Check-Point/web-mgmt-external-api-production/ | Harmony Endpoint API |
| IOC API Guide | https://sc1.checkpoint.com/documents/Infinity_Portal/WebAdminGuides/EN/IOC-Admin-Guide/ | IOC Management API |

### Getting Help

1. **Check Point Community**: https://community.checkpoint.com
2. **Support Portal**: https://supportcenter.checkpoint.com
3. **API Documentation**: Service-specific Swagger/OpenAPI docs

---

## Appendix: Complete Working Example

```python
#!/usr/bin/env python3
"""
Complete Check Point API Integration Example

This script demonstrates a complete integration workflow including:
- Authentication
- Token management
- API calls with error handling
- Pagination support
"""

import os
import sys
import json
import uuid
import time
import logging
import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class CheckpointAPIError(Exception):
    """Custom exception for Check Point API errors."""
    pass


class CheckpointClient:
    """
    Check Point Infinity Portal API Client
    
    Features:
    - Automatic token management
    - Request retry with backoff
    - Connection pooling
    - Comprehensive error handling
    """
    
    def __init__(self, client_id: str, secret_key: str, region: str = "eu"):
        """
        Initialize the client.
        
        Args:
            client_id: API Client ID from Infinity Portal
            secret_key: API Secret Key from Infinity Portal
            region: Region code (eu, us, au, ca, uk, me, in)
        """
        self.client_id = client_id
        self.secret_key = secret_key
        
        # Region mapping
        region_urls = {
            "eu": "https://cloudinfra-gw.portal.checkpoint.com",
            "us": "https://cloudinfra-gw-us.portal.checkpoint.com",
            "au": "https://cloudinfra-gw.ap.portal.checkpoint.com",
            "ca": "https://cloudinfra-gw.ca.portal.checkpoint.com",
            "uk": "https://cloudinfra-gw.uk.portal.checkpoint.com",
            "me": "https://cloudinfra-gw.me.portal.checkpoint.com",
            "in": "https://cloudinfra-gw.in.portal.checkpoint.com"
        }
        
        self.base_url = region_urls.get(region, region_urls["eu"])
        self.auth_url = f"{self.base_url}/auth/external"
        
        # Token management
        self._token: Optional[str] = None
        self._token_expiry: Optional[datetime] = None
        
        # Session for connection pooling
        self.session = requests.Session()
        
        logger.info(f"Initialized Check Point client for region: {region}")
        logger.info(f"Base URL: {self.base_url}")
    
    def _authenticate(self) -> str:
        """
        Authenticate and get new access token.
        
        Returns:
            JWT access token
            
        Raises:
            CheckpointAPIError: If authentication fails
        """
        logger.info("Authenticating with Check Point Infinity Portal...")
        
        try:
            response = self.session.post(
                self.auth_url,
                json={
                    "clientId": self.client_id,
                    "accessKey": self.secret_key
                },
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            response.raise_for_status()
            
            data = response.json()
            self._token = data["token"]
            
            # Set expiry with 5-minute buffer
            expires_in = data.get("expires_in", 1800)
            self._token_expiry = datetime.now() + timedelta(seconds=expires_in - 300)
            
            logger.info(f"Authentication successful. Token expires in {expires_in} seconds")
            return self._token
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Authentication failed: {e}")
            raise CheckpointAPIError(f"Authentication failed: {e}")
    
    def _get_valid_token(self) -> str:
        """Get valid token, refreshing if necessary."""
        if not self._token or datetime.now() >= self._token_expiry:
            return self._authenticate()
        return self._token
    
    def request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Make authenticated API request.
        
        Args:
            method: HTTP method (GET, POST, PUT, DELETE)
            endpoint: API endpoint path
            **kwargs: Additional arguments for requests
            
        Returns:
            JSON response as dictionary
            
        Raises:
            CheckpointAPIError: If request fails
        """
        token = self._get_valid_token()
        url = f"{self.base_url}{endpoint}"
        
        # Prepare headers
        headers = kwargs.pop("headers", {})
        headers.update({
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "x-av-req-id": str(uuid.uuid4())
        })
        
        if kwargs.get("json"):
            headers["Content-Type"] = "application/json"
        
        max_retries = kwargs.pop("max_retries", 3)
        
        for attempt in range(max_retries):
            try:
                logger.debug(f"{method} {endpoint} (attempt {attempt + 1})")
                
                response = self.session.request(
                    method,
                    url,
                    headers=headers,
                    timeout=30,
                    **kwargs
                )
                
                # Handle token expiration during request
                if response.status_code == 401:
                    logger.warning("Token expired during request, refreshing...")
                    self._token = None
                    token = self._authenticate()
                    headers["Authorization"] = f"Bearer {token}"
                    continue
                
                response.raise_for_status()
                return response.json()
                
            except requests.exceptions.HTTPError as e:
                status_code = response.status_code
                if status_code == 429:  # Rate limited
                    wait_time = 2 ** attempt
                    logger.warning(f"Rate limited. Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                    continue
                logger.error(f"HTTP error: {e}")
                raise CheckpointAPIError(f"HTTP error {status_code}: {e}")
                
            except requests.exceptions.RequestException as e:
                logger.error(f"Request error: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise CheckpointAPIError(f"Request failed after {max_retries} attempts: {e}")
        
        raise CheckpointAPIError("Max retries exceeded")
    
    def get(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make GET request."""
        return self.request("GET", endpoint, **kwargs)
    
    def post(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make POST request."""
        return self.request("POST", endpoint, **kwargs)
    
    def health_check(self) -> bool:
        """Check if API is accessible."""
        try:
            # Try to authenticate to verify connectivity
            self._authenticate()
            return True
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False


def main():
    """Main execution."""
    # Load credentials from environment
    client_id = os.environ.get("CHECKPOINT_CLIENT_ID", "6d607ba74da5454fbab0e06e66b3864b")
    secret_key = os.environ.get("CHECKPOINT_SECRET_KEY", "65684dd1f4444144ae4d1f719f21d6cd")
    
    # Initialize client
    client = CheckpointClient(client_id, secret_key, region="eu")
    
    # Health check
    logger.info("Performing health check...")
    if not client.health_check():
        logger.error("Health check failed. Exiting.")
        sys.exit(1)
    
    logger.info("Health check passed!")
    
    # Example: Get tenant info (generic endpoint)
    try:
        logger.info("Fetching tenant information...")
        tenant = client.get("/api/v1/tenant")
        logger.info(f"Tenant info: {json.dumps(tenant, indent=2)}")
    except CheckpointAPIError as e:
        logger.warning(f"Could not fetch tenant info: {e}")
    
    logger.info("Integration test complete!")


if __name__ == "__main__":
    main()
```

---

**End of First-Time Integration Guide**

*For questions or issues, refer to the Troubleshooting section or contact Check Point support.*
