# CuraHub installieren und betreiben

## Voraussetzungen

- Linux-Server mit Docker Engine und dem Compose-Plugin (`docker compose version`).
- Apache mit TLS-Zertifikat für die CuraHub-Domain und den Modulen `proxy`, `proxy_http`, `headers`.
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

## Backups

Drei Volumes gehören ins Backup: `<projekt>_secrets`, `<projekt>_db_data` und `<projekt>_backend_uploads` (`<projekt>` ist der Ordnername, z. B. `curahub`).

Datenbank-Dump:

```bash
docker compose exec db sh -c 'exec mariadb-dump -uroot -p"$(cat /run/curahub-secrets/db_root_password)" --single-transaction --routines curahub' > curahub-$(date +%Y%m%d-%H%M%S).sql
```

Ohne das Volume `secrets` kommt man nicht mehr an die Datenbank. Ein neues JWT-Secret meldet nur alle Nutzer:innen ab.

Bei einer bestehenden Installation (Datenbank vor dieser Compose-Datei angelegt) gilt weiter das Root-Passwort aus der alten `.env` (`DB_ROOT_PASSWORD`); die erzeugte Datei ist dort unbenutzt, und der Container hat keine Variable `MARIADB_ROOT_PASSWORD` mehr. Dump dann so (Datenbankname aus `DB_NAME`):

```bash
set -a; . ./.env; set +a
docker compose exec -e P="$DB_ROOT_PASSWORD" -e D="$DB_NAME" db sh -c 'exec mariadb-dump -uroot -p"$P" --single-transaction --routines "$D"' > curahub-$(date +%Y%m%d-%H%M%S).sql
```

## Update

```bash
git pull --ff-only
docker compose build app
docker compose up -d
```

Migrationen laufen beim Start automatisch. Vorher einen Dump ziehen.

## Notfälle

- Admin-Passwort vergessen: `docker compose exec app node dist/scripts/reset-local-admin.js notfall` (legt das Konto an, falls es fehlt).
- Setup erneut öffnen (Daten und Konten bleiben): `docker compose exec app node dist/scripts/reset-setup.js`, dann `docker compose restart app`; der neue Code steht im Log.
- Zustand prüfen: als Admin unter „Benutzerverwaltung" → Abschnitt „System".

## Bestehende Installation

Eine vorhandene `.env` mit `DATABASE_URL`, `JWT_SECRET`, `APP_EXTERNAL_PORT` und `APP_BIND_ADDRESS` funktioniert weiter; Werte aus der `.env` haben Vorrang vor den erzeugten Secrets. Die Migration `system_settings` markiert eine Datenbank mit Nutzer:innen als eingerichtet, der Assistent erscheint dort nicht.

- Hinter Cloudflare zusätzlich `BEHIND_CLOUDFLARE=true` setzen.
- Der Datenbank-Port wird nicht mehr auf dem Host veröffentlicht; Dumps laufen über `docker compose exec db …`.
