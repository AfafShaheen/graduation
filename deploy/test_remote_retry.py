"""The upload survives a connection that drops in the middle (no real server needed).

Run:  py -m unittest deploy/test_remote_retry.py
"""
import importlib.util
import ssl
import tempfile
import unittest
from pathlib import Path

_spec = importlib.util.spec_from_file_location("deploy_script", Path(__file__).with_name("deploy.py"))
deploy = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(deploy)


class FakeFtp:
    """Stands in for the FTP connection: fails the first N uploads, then stores the bytes."""

    def __init__(self, failures, store):
        self.failures = failures
        self.store = store
        self.closed = False

    def storbinary(self, command, fileobj):
        if self.failures:
            self.failures.pop(0)
            raise TimeoutError("_ssl.c:1064: The handshake operation timed out")
        self.store[command] = fileobj.read()

    def mkd(self, path):
        pass

    def close(self):
        self.closed = True


def make_remote(failures):
    store = {}
    remote = deploy.Remote.__new__(deploy.Remote)
    remote.root = "/home/x"
    remote.opened = 0
    shared_failures = failures

    def fake_open():
        remote.opened += 1
        return FakeFtp(shared_failures, store)

    remote._open = fake_open
    remote.ftp = fake_open()
    return remote, store


class RetryTest(unittest.TestCase):
    def setUp(self):
        self._sleep = deploy.time.sleep
        deploy.time.sleep = lambda s: None  # do not wait in a test
        self._say = deploy.say
        deploy.say = lambda *a, **k: None
        self.tmp = tempfile.TemporaryDirectory()
        self.file = Path(self.tmp.name) / "index.html"
        self.file.write_bytes(b"<html>hello</html>")

    def tearDown(self):
        deploy.time.sleep = self._sleep
        deploy.say = self._say
        self.tmp.cleanup()

    def test_a_dropped_connection_is_reopened_and_the_file_sent_again(self):
        remote, store = make_remote([1, 1])  # the first two attempts fail
        remote.upload(self.file, "public_html/graduation__new/index.html", set())
        self.assertEqual(store["STOR /home/x/public_html/graduation__new/index.html"], b"<html>hello</html>")
        self.assertEqual(remote.opened, 3, "one connection at the start and one more after each failure")

    def test_other_kinds_of_transient_errors_are_retried_too(self):
        for error in (ssl.SSLError("handshake"), EOFError(), deploy.ftplib.error_temp("421 try later")):
            remote, store = make_remote([])
            remote.ftp.failures = [1]
            original = remote.ftp.storbinary

            def raising(command, fileobj, _e=error, _orig=original, _r=remote):
                if _r.ftp is _r_first[0]:
                    raise _e
                return _orig(command, fileobj)

            _r_first = [remote.ftp]
            remote.ftp.storbinary = raising
            remote.upload(self.file, "a/index.html", set())
            self.assertIn("STOR /home/x/a/index.html", store, type(error).__name__)

    def test_it_gives_up_after_the_last_attempt_and_says_so(self):
        remote, store = make_remote([1] * 10)
        with self.assertRaises(deploy.DeployError) as caught:
            remote.upload(self.file, "a/index.html", set())
        self.assertIn(str(deploy._UPLOAD_ATTEMPTS), str(caught.exception))
        self.assertEqual(store, {})

    def test_a_refusal_from_the_server_is_not_retried(self):
        remote, store = make_remote([])

        def refuse(command, fileobj):
            raise deploy.ftplib.error_perm("550 Permission denied")

        remote.ftp.storbinary = refuse
        with self.assertRaises(deploy.ftplib.error_perm):
            remote.upload(self.file, "a/index.html", set())
        self.assertEqual(remote.opened, 1, "no reconnect for a permanent answer")

    def test_the_data_connection_reuses_the_tls_session(self):
        self.assertTrue(issubclass(deploy._FTPTLSReuse, deploy.ftplib.FTP_TLS))
        self.assertIn("session=self.sock.session", Path(deploy.__file__).read_text(encoding="utf-8"))

    def test_a_space_in_the_user_name_is_removed(self):
        remote = deploy.Remote.__new__(deploy.Remote)
        cfg = {"ftp": {"host": "h", "user": " name@example.com", "tls": True}}
        import os
        os.environ["DEPLOY_FTP_PASSWORD"] = "x"
        deploy.Remote.__init__(remote, cfg)
        self.assertEqual(remote.user, "name@example.com")


if __name__ == "__main__":
    unittest.main()
