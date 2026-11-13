"""A file says what happened to it: why it failed, and why rows were left alone."""

from tests.test_upload_to_login_flow import (  # noqa: F401  (setup is a fixture)
    _register_and_login,
    _row,
    _upload,
    _upload_file,
    _xlsx,
    setup,
)


async def _files(client, headers):
    resp = await client.get("/api/admin/university-files", headers=headers)
    assert resp.status_code == 200, resp.text
    return {item["original_name"]: item for item in resp.json()["items"]}


async def test_a_failed_file_keeps_its_errors_for_the_list(client, setup):
    event, college, headers = setup
    bad = _xlsx([
        _row("940001"),
        _row("94000x"),                       # not digits
        _row("940003", gpa="abc"),            # not a number
        _row("940004", college="كلية غير موجودة"),
    ])
    up = await _upload_file(client, headers, event.id, bad, filename="graduates_science.xlsx")
    assert up.status_code == 200, up.text
    assert up.json()["status"] == "failed" and len(up.json()["errors"]) >= 3

    # the list, read later and from scratch, still says why
    item = (await _files(client, headers))["graduates_science.xlsx"]
    assert item["status"] == "failed"
    assert item["error_count"] == len(up.json()["errors"]) and item["error_count"] >= 3
    assert item["rows_total"] == 4
    assert (item["rows_imported"], item["rows_updated"], item["rows_skipped"]) == (0, 0, 0)
    fields = {e["field"] for e in item["errors"]}
    assert "الرقم الجامعي" in fields and "المعدل" in fields and "الكلية" in fields
    first = item["errors"][0]
    assert first["row"] is not None and first["message"] and "value" in first
    assert any(e["row"] == 3 and e["value"] == "94000x" for e in item["errors"]), "the row and the value as found in the file"


async def test_only_the_first_errors_are_listed_but_all_are_counted(client, setup):
    event, college, headers = setup
    rows = [_row(f"9500{n:02d}", gpa="abc") for n in range(120)]
    up = await _upload_file(client, headers, event.id, _xlsx(rows), filename="many.xlsx")
    assert up.json()["status"] == "failed"
    item = (await _files(client, headers))["many.xlsx"]
    assert item["error_count"] == 120
    assert len(item["errors"]) == 50, "the list shows 50, the whole count is kept"


async def test_a_good_file_has_no_errors_and_a_failed_one_does_not_pretend_to_have_imported(client, setup):
    event, college, headers = setup
    ok = await _upload_file(client, headers, event.id, _xlsx([_row("940010"), _row("940011")]), filename="good.xlsx")
    assert ok.json()["status"] == "imported"
    item = (await _files(client, headers))["good.xlsx"]
    assert item["status"] == "imported" and item["error_count"] == 0 and item["errors"] == []
    assert item["rows_imported"] == 2


async def test_rows_left_alone_because_the_graduate_registered_are_counted(client, setup, sent_otps):
    """"added 0, updated 0, skipped 0" must never hide that everybody had already registered."""
    event, college, headers = setup
    first = await _upload_file(client, headers, event.id, _xlsx([_row("940020"), _row("940021")]), filename="first.xlsx")
    assert first.json()["status"] == "imported"
    await _register_and_login(client, sent_otps, college.id, "940020", "a@example.com")
    await _register_and_login(client, sent_otps, college.id, "940021", "b@example.com")

    again = await _upload_file(client, headers, event.id, _xlsx([_row("940020"), _row("940021")]), filename="again.xlsx")
    body = again.json()
    assert body["status"] == "imported"
    assert (body["import"]["added"], body["import"]["updated"], body["import"]["skipped"]) == (0, 0, 0)
    assert body["import"]["skipped_registered"] == 2, "the answer says why nothing changed"

    item = (await _files(client, headers))["again.xlsx"]
    assert item["rows_skipped_registered"] == 2 and item["rows_total"] == 2


async def test_the_old_screen_still_gets_the_errors_in_the_answer(client, setup):
    event, college, headers = setup
    resp = await _upload(client, headers, event.id, _xlsx([_row("94003x")]))
    assert resp.status_code == 200 and resp.json()["errors"], resp.text
