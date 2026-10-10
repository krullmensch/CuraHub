# CuraHub installieren und betreiben

## Voraussetzungen

- Linux-Server mit Docker Engine und dem Compose-Plugin (`docker compose version`).
- Apache ab 2.4.47 mit TLS-Zertifikat für die CuraHub-Domain und den Modulen `proxy`, `proxy_http`, `headers` (die Live-Anwesenheit läuft als WebSocket über `/api/live`; `deploy/apache/curahub.conf` leitet sie mit `upgrade=websocket` weiter).
- Ausgehender HTTPS-Zugriff auf [www.hsbi.de](https://www.hsbi.de) (HSBI-Login).
- Mindestens 10 GB freier Speicher für Uploads.

## Neuinstallation

1. Code holen: `git clone <repo-url> /opt/curahub && cd /opt/curahub`
2. Starten: `docker compose up -d --build` (der erste Build dauert einige Minuten). Eine `.env` ist nicht nötig; Datenbank-Passwörter und JWT-Secret erzeugt der `init`-Container.
3. Apache: `deploy/apache/curahub.conf` im `<VirtualHost *:443>` der Domain einbinden, dann `apachectl configtest && systemctl reload apache2`.
4. Setup-Code anzeigen: `docker compose logs app | grep Setup-Code`
5. `https://<domain>/setup` öffnen und den Assistenten durchgehen: Setup-Code, Systemcheck, öffentliche Adresse, Notfall-Admin, HSBI-Admin.

Danach mit dem HSBI-Konto anmelden, unter „Benutzerverwaltung" Kurator:innen freischalten, ein Projekt anlegen, Werke hochladen und im Satelliten platzieren. Das Raummodell des Satelliten ist Teil des Images.

Bis der Assistent abgeschlossen ist, antwortet die API nur mit `503 setup_required`. Nach dem Abschluss ist `/setup` gesperrt.

## Daten und Backups

Alles, was bleiben muss, liegt im Ordner `data/` des Stack-Verzeichnisses.

| Ordner | Inhalt | Ins Backup? |
|---|---|---|
| `data/uploads` | hochgeladene Bilder, Videos, 3D-Modelle und PDFs | ja |
| `data/backups` | tägliche Datenbank-Dumps (`curahub-<Datum>.sql.gz`, 14 Tage) | ja |
| `data/secrets` | Datenbank-Passwörter und JWT-Secret, vom `init`-Container erzeugt | nein |
| `data/db` | die laufenden Dateien der MariaDB | nein |

Der Dienst `backup` schreibt einmal am Tag einen Dump nach `data/backups`, außerdem gleich beim Start, wenn der letzte älter als einen Tag ist. Wiederhergestellt wird aus diesen Dumps: eine Kopie von `data/db`, die bei laufender Datenbank entsteht, ist nicht in sich stimmig. Ob die Dumps laufen, zeigt der Systemcheck unter „Benutzerverwaltung" → „System".

`data/secrets` gehört nicht ins Backup: Die Passwörter darin braucht nur dieser Server, und bei einer Wiederherstellung erzeugt `init` neue. Die Dumps enthalten keine Datenbank-Benutzer und keine Klartext-Passwörter (Notfall-Konten nur als bcrypt-Hash), aber personenbezogene Daten wie E-Mail-Adressen; das Backup braucht entsprechenden Schutz. `data/secrets` und `data/backups` sind auf dem Server nur für root lesbar.

Dump von Hand:

```bash
docker compose exec backup bash /db-backup.sh now
```

### Wiederherstellen oder auf einen neuen Server umziehen

1. Stack-Verzeichnis mit `data/uploads` und `data/backups` auf den Server kopieren; `data/secrets` und `data/db` gibt es dort nicht (oder sie sind leer).
2. Nur die Datenbank starten: `docker compose up -d db`. `init` erzeugt neue Passwörter, die Datenbank legt den Benutzer `curahub` damit an.
3. Dump einspielen:

```bash
gunzip -c data/backups/curahub-<Datum>.sql.gz | docker compose exec -T db sh -c 'exec mariadb -uroot -p"$(cat /run/curahub-secrets/db_root_password)"'
```

4. Alles starten: `docker compose up -d`, dann Apache wie bei der Neuinstallation einrichten.

Durch das neue JWT-Secret müssen sich alle einmal neu anmelden; Projekte, Ausstellungen, Konten und Uploads sind unverändert. Steht in der `.env` eine eigene `DATABASE_URL` (Installationen von vor dem Setup-Assistenten), muss deren Datenbank-Benutzer vor dem Start der App angelegt werden.

## Notfälle

- Admin-Passwort vergessen: `docker compose exec app node dist/scripts/reset-local-admin.js notfall` (legt das Konto an, falls es fehlt).
- Setup erneut öffnen (Daten und Konten bleiben): `docker compose exec app node dist/scripts/reset-setup.js`, dann `docker compose restart app`; der neue Code steht im Log.
- Zustand prüfen: als Admin unter „Benutzerverwaltung" → Abschnitt „System".

## Bestehende Installation

Eine vorhandene `.env` mit `DATABASE_URL`, `JWT_SECRET`, `APP_EXTERNAL_PORT` und `APP_BIND_ADDRESS` funktioniert weiter; Werte aus der `.env` haben Vorrang vor den erzeugten Secrets. Die Migration `system_settings` markiert eine Datenbank mit Nutzer:innen als eingerichtet, der Assistent erscheint dort nicht.

- Hinter Cloudflare zusätzlich `BEHIND_CLOUDFLARE=true` setzen.
- Eigene Apache-Konfiguration: `ProxyPass` braucht `upgrade=websocket` (siehe `deploy/apache/curahub.conf`). Ohne bleibt die Live-Anwesenheit „Offline“; Editor und Viewer funktionieren trotzdem.
- Der Datenbank-Port wird nicht mehr auf dem Host veröffentlicht.

### Umzug aus Docker-Volumes nach `data/`

Installationen von vor Oktober 2026 haben ihre Daten in den Volumes `<projekt>_db_data`, `<projekt>_backend_uploads` und `<projekt>_secrets` (`<projekt>` ist der Ordnername). Die aktuelle Compose-Datei liest nur noch `data/`. Ein `docker compose up -d` ohne Umzug startet mit leerer Datenbank und dem Setup-Assistenten — die alten Daten sind dann nicht weg, aber nicht eingebunden. Einmalig umziehen:

```bash
docker compose down
git pull --ff-only
sh deploy/migrate-volumes.sh
docker compose up -d --build
```

Das Skript bricht ab, solange der Stack läuft oder `data/db` schon Daten hat, kopiert die drei Volumes nach `data/` und übernimmt `DB_ROOT_PASSWORD` aus der Umgebung oder einer vorhandenen `.env` nach `data/secrets/db_root_password`, damit der Dienst `backup` die Datenbank lesen kann. Die Volumes bleiben unverändert; wenn alle Ausstellungen da sind, mit `docker volume rm <projekt>_db_data <projekt>_backend_uploads <projekt>_secrets` löschen.
