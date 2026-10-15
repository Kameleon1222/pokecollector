# Rejestracja użytkowników

Na ekranie logowania pojawia się przycisk **Utwórz konto**. Formularz wymaga
nazwy użytkownika, hasła i powtórzenia hasła. Po rejestracji użytkownik jest
automatycznie zalogowany. Nowe konto ma rolę `trainer`, własną kolekcję
i prywatne ustawienia udostępniania. Administrator nadal zarządza kontami
w ustawieniach aplikacji.

Rejestracja działa w trybie wielu użytkowników. Każdy, kto ma dostęp do ekranu
logowania, może wtedy utworzyć konto. Nie wymaga poczty e-mail, nowych
zależności ani migracji bazy danych.

## Wgranie plików i uruchomienie

1. Rozpakuj paczkę do katalogu repozytorium zawierającego `backend/`,
   `frontend/`, `VERSION` i `docker-compose.build.yml`. Zachowaj ścieżki
   i zaakceptuj podmianę wskazanych plików. W przesłanym RAR ten katalog
   znajduje się w `pokecollector/pokecollector/`.
2. W lokalnym pliku `.env` ustaw:

   ```dotenv
   USER_MODE=multi
   ```

3. Otwórz terminal w tym katalogu i przebuduj aplikację z lokalnego kodu:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build backend frontend
   ```

4. Otwórz `http://localhost:3000`, odśwież stronę, wyloguj się w razie potrzeby
   i wybierz **Utwórz konto**. Jeśli aplikacja jest po angielsku, przycisk
   nazywa się **Create account**. Oba języki są obsługiwane.
5. Prześlij podmienione i nowe pliki do swojego forka na GitHubie. Pliku
   `.env` z hasłami nie dodawaj do repozytorium.

Na telefonie i komputerze loguj się na to samo konto, aby korzystać z tej
samej kolekcji. Osobne konta mają osobne kolekcje we wspólnej bazie.
Aktualizacja zachowuje istniejące dane; nie usuwaj wolumenu PostgreSQL.

## Zawartość paczki

Paczka zawiera pełne pliki do skopiowania, a nie fragmenty kodu.

| Plik | Zmiana |
| --- | --- |
| `backend/api/auth.py` | Rejestracja użytkownika, walidacja i limit prób |
| `backend/main.py` | Wspólny ogranicznik liczby żądań z trasą rejestracji |
| `frontend/src/api/client.js` | Wywołanie API rejestracji |
| `frontend/src/pages/Login.jsx` | Formularz rejestracji i automatyczne logowanie |
| `frontend/src/i18n/pl.js` | Polskie komunikaty |
| `frontend/src/i18n/en.js` | Angielskie komunikaty i język zapasowy |
| `frontend/docker-entrypoint.d/40-configure-public-mode.sh` | Wyłącznie poprawa końców linii CRLF na LF dla Linuksa |
| `.gitattributes` | Nowy plik: zachowanie LF w skryptach Dockera także na Windowsie |
| `backend/tests/test_registration.py` | Nowy plik: testy API |
| `frontend/tests/visual/registration.spec.js` | Nowy plik: testy formularza w przeglądarce |
| `docs/REGISTRATION.md` | Nowy plik: ta instrukcja |

## Zasady API

`POST /api/auth/register` przyjmuje JSON z polami `username` i `password`.
Dodatkowe pola, w tym `role`, są odrzucane. Nazwa musi mieć od 2 do 32
drukowalnych znaków; spacje na początku i końcu są usuwane. Zachowano
dotychczasowe rozróżnianie wielkich i małych liter w nazwach kont.

Hasło musi mieć co najmniej 8 znaków i mieścić się w limicie bcrypt:
72 bajty UTF-8. Znaki takie jak emoji zajmują więcej niż jeden bajt.
Hasła są zapisywane jako skróty bcrypt.

Sukces zwraca status `201` i token wraz z użytkownikiem, w tym samym formacie
co logowanie. Zajęta nazwa zwraca `409`; konflikt przy jednoczesnych próbach
utworzenia tej samej nazwy również jest obsługiwany. W trybie jednego
użytkownika rejestracja zwraca `403`.

Limit wynosi 5 prób rejestracji na minutę na źródłowy adres IP. Wykorzystuje
istniejący ogranicznik w pamięci procesu. Przy wielu procesach limit jest
osobny dla każdego z nich, a za serwerem proxy użytkownicy mogą współdzielić
jego adres IP.

## Sprawdzenie zmian

Z katalogu `backend/`:

```bash
python -m unittest tests.test_registration tests.test_auth_admin_safety tests.test_multi_user_mode_recovery
```

Z katalogu `frontend/`:

```bash
npm test
npm run build
npx playwright test registration.spec.js auth-startup.spec.js --project=desktop --project=mobile
```

Testy API używają odizolowanej bazy SQLite. Standardowe wdrożenie aplikacji
nadal korzysta z PostgreSQL. Testy przeglądarki sprawdzają formularz,
walidację, błędy, automatyczne logowanie i powrót do zapamiętanego konta;
odpowiedzi API są w tych testach symulowane. Zmiany sprawdzono bez
uruchamiania całego zestawu kontenerów Docker.
