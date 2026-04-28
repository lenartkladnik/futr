import http.server
import socketserver
import lopolis
import json
import os.path
from datetime import datetime, timedelta

PORT = 5847
DATA_FP = "meals.json"
creds = json.load(open("creds.json"))
USERNAME = creds["username"]
PASSWORD = creds["password"]
session = lopolis.Session(USERNAME, PASSWORD)

history: dict = {}

def get_meal_id(options: list[tuple[str, int]]) -> tuple[int, str]:
    meals = json.load(open(DATA_FP))

    for meal in meals:
        if meal.startswith("KATERA KOLI "):
            meal_n = meal.split("KOLI ")[1].split(".")[0]
            return options[int(meal_n) - 1][1], options[int(meal_n) - 1][0].title() # Choose the given id (-1 because it"s not 0 indexed)

        if meal == "ODJAVI":
            return -1, "Odjava" # -1 -> unset

        for name, id in options:
            if name.lower() == meal.lower():
                return id, name.title()

    return -2, "" # -2 -> not found

def set_meals():
    next_moday = datetime.today() + timedelta((0 - datetime.today().weekday()) % 7)
    for i in range(5):
        date = next_moday + timedelta(i)

        snack = session.api.get_meals_menu(date)["items"][0]["menus"]["afternoon_snack"]
        opts = [(i["description"].strip(), int(i["id"])) for i in snack]
        id, desc = get_meal_id(opts)

        if id == -2:
            print(f"Failed to set meal: {id}, for date: {date.strftime("%d/%m/%Y")}")
            continue

        if id == -1:
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

def save_gathered(n: int):
    gathered = gather_meals(n)
    existing = []

    if os.path.exists(DATA_FP):
        existing = json.load(open(DATA_FP))

    filtered = []

    for each in existing:
        if each in gathered:
            filtered.append(each)
            gathered.remove(each)

    missing = gathered # Now all of the existing ones have been removed

    with open(DATA_FP, "w") as f:
        f.write(json.dumps({"meals": filtered, "unordered": missing}))

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        try:
            if self.path == "/":
                self.path = "/index.html"
                return super().do_GET()

            if self.path == "/api/set" or self.path == "/api/gather":
                if self.path == "/api/set":
                    session.refresh()
                    set_meals()

                elif self.path == "/api/gather":
                    session.refresh()
                    save_gathered(32)

                self.send_response(301)
                self.send_header("Location", "/")
                self.end_headers()

            elif self.path == "/api/meals":
                data = b"[]"
                if os.path.exists(DATA_FP):
                    data = json.dumps(json.load(open(DATA_FP))["meals"]).encode()

                self._send_json(200, data)

            elif self.path == "/api/unordered":
                data = b"[]"
                if os.path.exists(DATA_FP):
                    data = json.dumps(json.load(open(DATA_FP))["unordered"]).encode()

                self._send_json(200, data)

            elif self.path == "/api/history":
                self._send_json(200, json.dumps(history).encode())

            elif self.path.startswith("/assets/"):
                return super().do_GET()

            else:
                self.path = "/404.html"
                return super().do_GET()

        except Exception as e:
            print(f"Failed to serve {self.path}: {e}")
            self.path = "/500.html"
            return super().do_GET()

    def _send_json(self, status, data: bytes):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving on http://localhost:{PORT}")
    try:
        httpd.serve_forever()

    except KeyboardInterrupt:
        pass
