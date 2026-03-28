import uvicorn
from api.server import app

if __name__ == "__main__":
    # Main entry point to run the backend
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=True)
