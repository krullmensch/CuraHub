# Benutzer- & Rechtesystem

CuraHub verfügt über ein rollenbasiertes Rechtesystem (RBAC), das über den HSBI SSO (Single Sign-On) angebunden ist. Die Anmeldung für Kuratoren erfolgt ausschließlich über Hochschul-Accounts (`@hsbi.de`).

## Rollen im Überblick

### 1. Viewer (Öffentlicher Besucher)
- **Zugang:** Ohne Login.
- **Rechte:** Kann veröffentlichte Ausstellungen ansehen (Viewer-Modus).
- **Einschränkung:** Kein Zugriff auf den Editor oder unveröffentlichte Entwürfe.

### 2. Curator (Kurator)
- **Zugang:** Registrierter Nutzer mit `@hsbi.de` Account.
- **Rechte:** 
  - Eigene Ausstellungsprojekte anlegen.
  - Medien hochladen (Bilder, Videos, 3D-Modelle).
  - Den 3D-Editor nutzen, um Kunstwerke und Wände im Raum zu platzieren.
  - Eigene Ausstellungen veröffentlichen.

### 3. Admin / Prof
- **Zugang:** Manuell zugewiesene Rolle.
- **Rechte:** 
  - Alle Rechte eines Kurators.
  - Sperrzonen (Restriction Zones) für Räume verwalten.
  - Herausragende Ausstellungen für die Startseite (Homepage) als "Featured" markieren.
