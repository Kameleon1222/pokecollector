import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.auth import limiter, router
from database import Base, get_db
from models import User
from services.auth import decode_token, hash_password, verify_password


class RegistrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.admin_hash = hash_password("admin-test-password")

    def setUp(self):
        self.mode = patch.dict("os.environ", {"USER_MODE": "multi"})
        self.mode.start()
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        User.__table__.create(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add(User(username="admin", hashed_password=self.admin_hash, role="admin", is_active=True))
        self.db.commit()
        limiter.reset()

        app = FastAPI()
        app.state.limiter = limiter
        app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
        app.add_middleware(SlowAPIMiddleware)
        app.include_router(router, prefix="/api/auth")

        def test_db():
            yield self.db

        app.dependency_overrides[get_db] = test_db
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()
        self.mode.stop()
        limiter.reset()

    def signup(self, username="Misty", password="trainer-password", **extra):
        return self.client.post(
            "/api/auth/register",
            json={"username": username, "password": password, **extra},
        )

    def test_signup_creates_private_trainer_with_hashed_password_and_session(self):
        response = self.signup()
        self.assertEqual(response.status_code, 201, response.text)
        data = response.json()
        self.assertEqual(data["token_type"], "bearer")
        self.assertEqual(data["user"]["role"], "trainer")
        self.assertFalse(data["user"]["must_change_password"])
        self.assertNotIn("password", data["user"])
        self.assertNotIn("hashed_password", data["user"])

        stored = self.db.query(User).filter_by(username="Misty").one()
        self.assertNotEqual(stored.hashed_password, "trainer-password")
        self.assertTrue(verify_password("trainer-password", stored.hashed_password))
        self.assertTrue(stored.is_active)
        self.assertFalse(stored.is_profile_public)
        self.assertFalse(stored.public_show_values)
        self.assertEqual(stored.wishlist_visibility, "private")
        self.assertEqual(decode_token(data["access_token"])["sub"], str(stored.id))

        headers = {"Authorization": f"Bearer {data['access_token']}"}
        me = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["id"], stored.id)
        self.assertEqual(self.client.get("/api/auth/users", headers=headers).status_code, 403)

    def test_signup_cannot_choose_admin_role_or_account_flags(self):
        for extra in ({"role": "admin"}, {"is_active": False}, {"must_change_password": False}):
            with self.subTest(extra=extra):
                response = self.signup(**extra)
                self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.db.query(User).count(), 1)

    def test_existing_admin_name_cannot_be_registered(self):
        response = self.signup(username="admin")
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["detail"]["code"], "username_taken")
        self.assertEqual(self.db.query(User).count(), 1)
        self.assertEqual(self.db.query(User).filter_by(username="admin").one().role, "admin")

    def test_duplicate_name_is_rejected_and_existing_password_is_preserved(self):
        self.assertEqual(self.signup().status_code, 201)
        response = self.signup(password="different-password")
        self.assertEqual(response.status_code, 409, response.text)
        stored = self.db.query(User).filter_by(username="Misty").one()
        self.assertTrue(verify_password("trainer-password", stored.hashed_password))

    def test_racing_unique_constraint_is_reported_as_conflict_and_rolled_back(self):
        with patch.object(self.db, "commit", side_effect=IntegrityError("insert", {}, Exception("duplicate"))):
            response = self.signup()
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.db.query(User).count(), 1)
        self.assertEqual(self.signup(username="Brock").status_code, 201)

    def test_username_is_trimmed_and_supports_polish_characters_and_spaces(self):
        response = self.signup(username="  Żółwik Trener  ")
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()["user"]["username"], "Żółwik Trener")

    def test_invalid_usernames_are_rejected(self):
        for username in ("", "x", " " * 3, "a" * 33, "a\nb", "a\tb", "a\x00b"):
            with self.subTest(username=repr(username)):
                limiter.reset()
                self.assertIn(self.signup(username=username).status_code, (400, 422))
        self.assertEqual(self.db.query(User).count(), 1)

    def test_short_or_overlong_passwords_are_rejected(self):
        for password in ("", "1234567", "a" * 73, "😀" * 19):
            with self.subTest(password_length=len(password)):
                self.assertIn(self.signup(password=password).status_code, (400, 422))
        self.assertEqual(self.db.query(User).count(), 1)

    def test_unicode_password_at_bcrypt_byte_limit_can_log_in(self):
        password = "😀" * 18
        self.assertEqual(len(password.encode("utf-8")), 72)
        response = self.signup(password=password)
        self.assertEqual(response.status_code, 201, response.text)
        login = self.client.post("/api/auth/login", data={"username": "Misty", "password": password})
        self.assertEqual(login.status_code, 200, login.text)

    def test_new_user_can_log_in_again_with_their_password(self):
        self.assertEqual(self.signup().status_code, 201)
        response = self.client.post(
            "/api/auth/login", data={"username": "Misty", "password": "trainer-password"}
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["user"]["role"], "trainer")

    def test_existing_admin_can_still_log_in(self):
        response = self.client.post(
            "/api/auth/login", data={"username": "admin", "password": "admin-test-password"}
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["user"]["role"], "admin")

    def test_registration_is_unavailable_in_single_user_mode(self):
        with patch.dict("os.environ", {"USER_MODE": "single"}):
            response = self.signup()
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(response.json()["detail"]["code"], "registration_unavailable")
        self.assertEqual(self.db.query(User).count(), 1)

    def test_registration_is_limited_to_five_attempts_per_minute(self):
        self.assertEqual(self.signup().status_code, 201)
        for _ in range(4):
            self.assertEqual(self.signup().status_code, 409)
        response = self.signup(username="Brock")
        self.assertEqual(response.status_code, 429, response.text)
        self.assertIsNone(self.db.query(User).filter_by(username="Brock").first())


if __name__ == "__main__":
    unittest.main()
