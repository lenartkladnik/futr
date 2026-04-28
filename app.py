import http.server
import socketserver
from typing import Any
import lopolis
import json
import os.path
from datetime import datetime, timedelta

PORT = 5847
DATA_FP = "meals.json"
CREDS_FP = "creds.json"
creds_exist = False
try:
    creds = json.load(open(CREDS_FP))
    USERNAME = creds["username"]
    PASSWORD = creds["password"]
    session = lopolis.Session(USERNAME, PASSWORD)
    creds_exist = True
except FileNotFoundError:
    pass

history: dict = {}

UNSET_MEAL = -1
MEAL_NOT_FOUND = -2

def get_meal_id(options: list[tuple[str, int]]) -> tuple[int, str]:
    meals = json.load(open(DATA_FP))

    for meal in meals:
        if meal.startswith("KATERA KOLI "):
            meal_n = meal.split("KOLI ")[1].split(".")[0]
            return options[int(meal_n) - 1][1], options[int(meal_n) - 1][0].title() # Choose the given id (-1 because it"s not 0 indexed)

        if meal == "ODJAVI":
            return UNSET_MEAL, "Odjava"

        for name, id in options:
            if name.lower() == meal.lower():
                return id, name.title()

    return MEAL_NOT_FOUND, ""

def set_meals():
    next_moday = datetime.today() + timedelta((0 - datetime.today().weekday()) % 7)
    for i in range(5):
        date = next_moday + timedelta(i)

        snack = session.api.get_meals_menu(date)["items"][0]["menus"]["afternoon_snack"]
        opts = [(i["description"].strip(), int(i["id"])) for i in snack]
        id, desc = get_meal_id(opts)

        if id == MEAL_NOT_FOUND:
            print(f"Failed to set meal: {id}, for date: {date.strftime("%d/%m/%Y")}")
            continue

        if id == UNSET_MEAL:
            r = session.api.unset_meals_menu(date)
        else:
            r = session.api.set_meals_menu(date, id)

        if not r["ok"]:
            print(f"Failed to set meal: {id}, for date: {date.strftime("%d/%m/%Y")}")
            print(f"-> {r}")
            continue

        datestr = date.strftime("%d-%m")
        if not (datestr in history.keys()):
            history.update({datestr: desc})

def gather_meals(n: int) -> list:
    gathered: list[str] = []
    for i in range(n):
        date = datetime.today() - timedelta(i)

        try:
            snack = session.api.get_meals_menu(date)["items"][0]["menus"]["afternoon_snack"]
            names = [i["description"].strip() for i in snack]

            for i in names:
                if not i in gathered:
                    i = i.replace("SENDIVČ", "Sendvič")
                    gathered.append(i)
        except:
            pass

    gathered.remove("NI")
    gathered.remove("medicinsko predpisane diete po dogovoru")
    try:
        gathered.remove("")
    except:
        pass

    for i in range(1, 5):
        gathered.append(f"KATERA KOLI {i}.")

    gathered.append("ODJAVI")

    return gathered

def write_meals(meals: dict):
    with open(DATA_FP, "w") as f:
        f.write(json.dumps(meals))

def save_gathered(n: int):
    gathered: list[str] = gather_meals(n)
    meals = {"meals": [], "unordered": []}

    if os.path.exists(DATA_FP):
        meals: dict[str, list[str]] = json.load(open(DATA_FP))

    for each in meals["meals"]:
        if not each in gathered:
            meals["meals"].remove(each)

        else:
            gathered.remove(each)

    meals["unordered"] = gathered

    write_meals(meals)

def strip_dict(obj: dict[str, Any], *fields: str) -> dict:
    new_obj = {}
    for field in fields:
        if field in obj.keys():
            new_obj.update({field: obj[field]})

    return new_obj

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        try:
            if self.path == "/":
                self.path = "/index.html"
                return super().do_GET()

            elif self.path == "/api/credentials":
                if creds_exist:
                    return self.send_json(200, b"true")

                return self.send_json(200, b"false")

            elif self.path.startswith("/assets/"):
                return super().do_GET()

            elif not creds_exist:
                self.send_response(301)
                self.send_header("Location", "/")
                self.end_headers()

            elif self.path == "/api/meals":
                data = b"[]"
                if os.path.exists(DATA_FP):
                    data = json.dumps(json.load(open(DATA_FP))["meals"]).encode()

                self.send_json(200, data)

            elif self.path == "/api/unordered":
                data = b"[]"
                if os.path.exists(DATA_FP):
                    data = json.dumps(json.load(open(DATA_FP))["unordered"]).encode()

                self.send_json(200, data)

            elif self.path == "/api/history":
                self.send_json(200, json.dumps(history).encode())

            elif self.path == "/api/set" or self.path == "/api/gather":
                if self.path == "/api/set":
                    session.refresh()
                    set_meals()

                elif self.path == "/api/gather":
                    session.refresh()
                    save_gathered(32)

                self.send_response(301)
                self.send_header("Location", "/")
                self.end_headers()

            else:
                self.path = "/404.html"
                return super().do_GET()

        except Exception as e:
            print(f"[do_GET] Failed to serve {self.path}: {e}")
            self.path = "/500.html"
            return super().do_GET()

    def do_POST(self):
        try:
            if self.path == "/api/credentials":
                try:
                    data = strip_dict(self.get_form(), "username", "password")

                    if data:
                        with open(CREDS_FP, "w") as f:
                            f.write(json.dumps(data))

                    return self.send_json(200, b"{\"ok\": true}")
                except:
                    return self.send_json(500, b"{\"ok\": false}")

            elif not creds_exist:
                return self.send_json(400, b"{\"status\": 400, \"message\": \"Credentials not set\"}")

            elif self.path == "/api/meals":
                try:
                    data = strip_dict(self.get_form(), "meals", "unordered")

                    if data:
                        write_meals(data)

                    return self.send_json(200, b"{\"ok\": true}")
                except:
                    return self.send_json(500, b"{\"ok\": false}")

        except Exception as e:
            print(f"[do_POST] Failed to serve {self.path}: {e}")
            return self.send_json(500, b"{\"status\": 500, \"message\": \"Internal server error\"}")

    def send_json(self, status, data: bytes):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def get_form(self):
        return json.loads(self.rfile.read(int(self.headers['Content-Length'])))

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving on http://localhost:{PORT}")
    try:
        httpd.serve_forever()

    except KeyboardInterrupt:
        pass
