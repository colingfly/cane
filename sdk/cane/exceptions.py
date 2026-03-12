class CaneError(Exception):
    """Base exception for all Cane SDK errors."""
    pass


class CaneAPIError(CaneError):
    """Raised when the Cane API returns an error response."""

    def __init__(self, status_code: int, message: str, body: dict = None):
        self.status_code = status_code
        self.message = message
        self.body = body or {}
        super().__init__(f"[{status_code}] {message}")


class CaneConnectionError(CaneError):
    """Raised when the SDK cannot reach the Cane API."""

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)
