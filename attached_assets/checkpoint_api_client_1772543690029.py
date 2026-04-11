#!/usr/bin/env python3
"""
Check Point Infinity Portal API Client

A production-ready Python client for the Check Point Infinity Portal API.
Features:
- Automatic token management with refresh
- Connection pooling
- Retry logic with exponential backoff
- Comprehensive error handling
- Support for all regions
"""

import json
import uuid
import time
import logging
import requests
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, Union
from dataclasses import dataclass
from functools import wraps

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# =============================================================================
# Exceptions
# =============================================================================

class CheckpointError(Exception):
    """Base exception for Check Point API errors."""
    pass


class AuthenticationError(CheckpointError):
    """Raised when authentication fails."""
    pass


class APIError(CheckpointError):
    """Raised when API request fails."""
    
    def __init__(self, message: str, status_code: int = None, response: dict = None):
        super().__init__(message)
        self.status_code = status_code
        self.response = response


class RateLimitError(CheckpointError):
    """Raised when rate limit is exceeded."""
    pass


# =============================================================================
# Configuration
# =============================================================================

@dataclass
class CheckpointConfig:
    """Configuration for Check Point API client."""
    client_id: str
    secret_key: str
    region: str = "eu"
    timeout: int = 30
    max_retries: int = 3
    retry_delay: float = 1.0
    token_buffer_seconds: int = 300  # Refresh token 5 minutes before expiry
    
    # Region URLs
    REGION_URLS = {
        "eu": "https://cloudinfra-gw.portal.checkpoint.com",
        "us": "https://cloudinfra-gw-us.portal.checkpoint.com",
        "au": "https://cloudinfra-gw.ap.portal.checkpoint.com",
        "ca": "https://cloudinfra-gw.ca.portal.checkpoint.com",
        "uk": "https://cloudinfra-gw.uk.portal.checkpoint.com",
        "me": "https://cloudinfra-gw.me.portal.checkpoint.com",
        "in": "https://cloudinfra-gw.in.portal.checkpoint.com"
    }
    
    @property
    def base_url(self) -> str:
        """Get base URL for configured region."""
        return self.REGION_URLS.get(self.region, self.REGION_URLS["eu"])
    
    @property
    def auth_url(self) -> str:
        """Get authentication URL."""
        return f"{self.base_url}/auth/external"


# =============================================================================
# Decorators
# =============================================================================

def retry_on_error(max_retries: int = 3, backoff_factor: float = 2):
    """Decorator to retry function on failure with exponential backoff."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except (requests.exceptions.RequestException, APIError) as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        wait_time = backoff_factor ** attempt
                        logger.warning(f"Request failed (attempt {attempt + 1}/{max_retries}). "
                                     f"Retrying in {wait_time}s...")
                        time.sleep(wait_time)
                    else:
                        break
            raise last_exception
        return wrapper
    return decorator


# =============================================================================
# Main Client Class
# =============================================================================

class CheckpointClient:
    """
    Check Point Infinity Portal API Client
    
    Usage:
        config = CheckpointConfig(
            client_id="your-client-id",
            secret_key="your-secret-key",
            region="eu"
        )
        
        client = CheckpointClient(config)
        
        # Make API calls
        events = client.get("/app/hec-api/v1.0/events")
    """
    
    def __init__(self, config: CheckpointConfig):
        """
        Initialize the client.
        
        Args:
            config: CheckpointConfig instance with credentials and settings
        """
        self.config = config
        self.session = requests.Session()
        
        # Token management
        self._token: Optional[str] = None
        self._token_expiry: Optional[datetime] = None
        
        logger.info(f"Initialized Check Point client")
        logger.info(f"  Region: {config.region}")
        logger.info(f"  Base URL: {config.base_url}")
    
    def _authenticate(self) -> str:
        """
        Authenticate and obtain new access token.
        
        Returns:
            JWT access token
            
        Raises:
            AuthenticationError: If authentication fails
        """
        logger.debug("Authenticating with Check Point...")
        
        try:
            response = self.session.post(
                self.config.auth_url,
                json={
                    "clientId": self.config.client_id,
                    "accessKey": self.config.secret_key
                },
                headers={"Content-Type": "application/json"},
                timeout=self.config.timeout
            )
            
            if response.status_code == 401:
                raise AuthenticationError("Invalid credentials")
            
            response.raise_for_status()
            data = response.json()
            
            self._token = data["token"]
            expires_in = data.get("expires_in", 1800)
            
            # Set expiry with buffer
            buffer_seconds = self.config.token_buffer_seconds
            self._token_expiry = datetime.now() + timedelta(seconds=expires_in - buffer_seconds)
            
            logger.debug(f"Authentication successful. Token expires in {expires_in}s")
            return self._token
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Authentication request failed: {e}")
            raise AuthenticationError(f"Failed to authenticate: {e}")
    
    def _get_token(self) -> str:
        """Get valid token, authenticating if necessary."""
        if not self._token or datetime.now() >= self._token_expiry:
            return self._authenticate()
        return self._token
    
    def _make_request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Make authenticated HTTP request.
        
        Args:
            method: HTTP method
            endpoint: API endpoint path
            **kwargs: Additional request arguments
            
        Returns:
            JSON response data
            
        Raises:
            APIError: If request fails
            RateLimitError: If rate limit exceeded
        """
        token = self._get_token()
        url = f"{self.config.base_url}{endpoint}"
        
        # Prepare headers
        headers = kwargs.pop("headers", {})
        headers.update({
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "x-av-req-id": str(uuid.uuid4())
        })
        
        if kwargs.get("json"):
            headers["Content-Type"] = "application/json"
        
        max_retries = kwargs.pop("max_retries", self.config.max_retries)
        
        for attempt in range(max_retries):
            try:
                logger.debug(f"{method} {endpoint} (attempt {attempt + 1})")
                
                response = self.session.request(
                    method,
                    url,
                    headers=headers,
                    timeout=self.config.timeout,
                    **kwargs
                )
                
                # Handle token expiration
                if response.status_code == 401:
                    logger.debug("Token expired, refreshing...")
                    self._token = None
                    token = self._authenticate()
                    headers["Authorization"] = f"Bearer {token}"
                    continue
                
                # Handle rate limiting
                if response.status_code == 429:
                    retry_after = int(response.headers.get("Retry-After", 60))
                    logger.warning(f"Rate limited. Waiting {retry_after}s...")
                    time.sleep(retry_after)
                    continue
                
                response.raise_for_status()
                return response.json()
                
            except requests.exceptions.HTTPError as e:
                status_code = response.status_code
                try:
                    error_data = response.json()
                    error_msg = error_data.get("message", str(e))
                except:
                    error_data = None
                    error_msg = str(e)
                
                if status_code == 429:
                    raise RateLimitError(f"Rate limit exceeded: {error_msg}")
                
                raise APIError(error_msg, status_code=status_code, response=error_data)
                
            except requests.exceptions.RequestException as e:
                if attempt < max_retries - 1:
                    wait_time = self.config.retry_delay * (2 ** attempt)
                    logger.warning(f"Request error: {e}. Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                    continue
                raise APIError(f"Request failed after {max_retries} attempts: {e}")
        
        raise APIError("Max retries exceeded")
    
    # =============================================================================
    # Public API Methods
    # =============================================================================
    
    def get(self, endpoint: str, params: dict = None, **kwargs) -> Dict[str, Any]:
        """Make GET request."""
        return self._make_request("GET", endpoint, params=params, **kwargs)
    
    def post(self, endpoint: str, data: dict = None, **kwargs) -> Dict[str, Any]:
        """Make POST request."""
        return self._make_request("POST", endpoint, json=data, **kwargs)
    
    def put(self, endpoint: str, data: dict = None, **kwargs) -> Dict[str, Any]:
        """Make PUT request."""
        return self._make_request("PUT", endpoint, json=data, **kwargs)
    
    def delete(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Make DELETE request."""
        return self._make_request("DELETE", endpoint, **kwargs)
    
    def health_check(self) -> bool:
        """Check if API is accessible."""
        try:
            self._authenticate()
            return True
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False
    
    # =============================================================================
    # Harmony Email & Collaboration (HEC) Methods
    # =============================================================================
    
    def hec_get_events(self, **params) -> Dict[str, Any]:
        """Get HEC security events."""
        return self.get("/app/hec-api/v1.0/events", params=params)
    
    def hec_get_event(self, event_id: str) -> Dict[str, Any]:
        """Get specific HEC event details."""
        return self.get(f"/app/hec-api/v1.0/event/{event_id}")
    
    def hec_quarantine_entity(self, entity_ids: list, action: str = "quarantine") -> Dict[str, Any]:
        """Perform action on HEC entities."""
        return self.post("/app/hec-api/v1.0/action/entity", data={
            "requestData": {
                "entityIds": entity_ids,
                "entityActionName": action
            }
        })
    
    def hec_get_exceptions(self, exc_type: str = "whitelist") -> Dict[str, Any]:
        """Get HEC exceptions (whitelist or blacklist)."""
        return self.get(f"/app/hec-api/v1.0/exceptions/{exc_type}")
    
    # =============================================================================
    # Harmony Endpoint Methods
    # =============================================================================
    
    def endpoint_get_computers(self, **params) -> Dict[str, Any]:
        """Get list of endpoint computers."""
        return self.get("/app/endpoint-web-mgmt-api/v1/computers", params=params)
    
    def endpoint_get_computer(self, computer_id: str) -> Dict[str, Any]:
        """Get specific computer details."""
        return self.get(f"/app/endpoint-web-mgmt-api/v1/computers/{computer_id}")
    
    # =============================================================================
    # IOC Management Methods
    # =============================================================================
    
    def ioc_get_feeds(self) -> Dict[str, Any]:
        """Get IOC feeds."""
        return self.get("/app/ioc-api/v1/feeds")
    
    def ioc_add_indicators(self, feed_id: str, indicators: list) -> Dict[str, Any]:
        """Add indicators to IOC feed."""
        return self.post(f"/app/ioc-api/v1/feeds/{feed_id}/indicators", data={
            "indicators": indicators
        })


# =============================================================================
# Convenience Functions
# =============================================================================

def create_client(
    client_id: str,
    secret_key: str,
    region: str = "eu",
    **kwargs
) -> CheckpointClient:
    """
    Create a Check Point client with simple parameters.
    
    Args:
        client_id: API Client ID
        secret_key: API Secret Key
        region: Region code (eu, us, au, ca, uk, me, in)
        **kwargs: Additional config options
        
    Returns:
        CheckpointClient instance
    """
    config = CheckpointConfig(
        client_id=client_id,
        secret_key=secret_key,
        region=region,
        **kwargs
    )
    return CheckpointClient(config)


# =============================================================================
# Example Usage
# =============================================================================

if __name__ == "__main__":
    # Example credentials (replace with yours)
    CLIENT_ID = "6d607ba74da5454fbab0e06e66b3864b"
    SECRET_KEY = "65684dd1f4444144ae4d1f719f21d6cd"
    
    # Create client
    client = create_client(CLIENT_ID, SECRET_KEY, region="eu")
    
    # Health check
    if not client.health_check():
        print("Health check failed!")
        exit(1)
    
    print("✅ Client initialized and authenticated successfully!")
    
    # Example API calls (uncomment based on your service):
    
    # HEC Example
    # events = client.hec_get_events()
    # print(f"Total events: {events['responseEnvelope']['totalRecordsNumber']}")
    
    # Endpoint Example
    # computers = client.endpoint_get_computers()
    # print(f"Total computers: {len(computers.get('data', []))}")
    
    # IOC Example
    # feeds = client.ioc_get_feeds()
    # print(f"Total feeds: {len(feeds.get('data', []))}")
