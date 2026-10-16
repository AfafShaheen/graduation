import pytest
from fastapi import status

@pytest.mark.anyio
async def test_get_graduates_me_unauthorized(client):
    response = await client.get("/api/graduates/me")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

@pytest.mark.anyio
async def test_get_graduates_me_unverified(client, unverified_graduate_headers):
    response = await client.get("/api/graduates/me", headers=unverified_graduate_headers)
    assert response.status_code == status.HTTP_403_FORBIDDEN

@pytest.mark.anyio
async def test_get_graduates_me_success(client, graduate_headers):
    response = await client.get("/api/graduates/me", headers=graduate_headers)
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "full_name" in data
    assert "university_id" in data
    assert "college_name" in data
    assert "unique_graduate_code" in data
