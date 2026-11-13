"""The ceremony form: a blank name, a broken WhatsApp link and a repeated name are refused."""

from tests.test_admin_event_time_seats import _admin_token, _event_body


async def test_blank_name_is_refused_and_a_good_name_is_cleaned(client, make_admin):
    headers = await _admin_token(client, make_admin)
    blank = await client.post("/api/admin/events", json=_event_body(["كلية أ"], name="     "), headers=headers)
    assert blank.status_code == 422

    ok = await client.post(
        "/api/admin/events", json=_event_body(["كلية أ"], name="  حفل   التخرج  "), headers=headers
    )
    assert ok.status_code in (200, 201), ok.text
    listing = await client.get("/api/admin/events", headers=headers)
    assert "حفل التخرج" in listing.text


async def test_whatsapp_link_must_be_a_whole_link(client, make_admin):
    headers = await _admin_token(client, make_admin)
    for bad in ["", "   ", "abc", "chat.whatsapp.com/x", "https://", "ftp://a.b/c", "https://a b.com/x"]:
        response = await client.post(
            "/api/admin/events",
            json=_event_body(["كلية ب"], name="حفل " + str(len(bad)), whatsapp_group_link=bad),
            headers=headers,
        )
        assert response.status_code == 422, (bad, response.text)


async def test_two_ceremonies_cannot_share_a_name(client, make_admin):
    headers = await _admin_token(client, make_admin)
    first = await client.post("/api/admin/events", json=_event_body(["كلية ج"], name="حفل الربيع"), headers=headers)
    assert first.status_code in (200, 201), first.text
    again = await client.post("/api/admin/events", json=_event_body(["كلية د"], name=" حفل  الربيع "), headers=headers)
    assert again.status_code == 409, again.text
