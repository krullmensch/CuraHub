# 2D-Wandeditor

Im 2D-Wandeditor hängst du die Werke einer Wand zentimetergenau, so als ständest du frontal davor. Die Kamera fliegt vor die gewählte Wand und schaltet auf eine verzerrungsfreie Frontalansicht um. Alle anderen Wände, ihre Werke und der Raum werden ausgeblendet, sodass du nur noch diese eine Fläche siehst.

Die Werke bleiben dabei dieselben wie in der 3D-Ansicht: Was du hier verschiebst, steht sofort auch im Raum an der neuen Stelle, und gespeichert wird wie gewohnt automatisch.

## Welche Wände lassen sich öffnen?

- **Stellwände** mit allen vier Flächen: Vorderseite, Rückseite und die beiden schmalen Seitenteile (**Links** und **Rechts**, von der Vorderseite aus gesehen).
- **Raumwände** des Satellit: Fensterwand, Seitenwand rechts, Rückwand und Seitenwand links. Fenster und Türen erkennt CuraHub automatisch und zeichnet sie schraffiert ein. Werke rasten an ihren Kanten ein, beim Messen siehst du den Abstand zu ihnen, und ein Werk, das über einer Öffnung hängt, wird rot markiert.

## Öffnen und schließen

- **Doppelklick** auf eine Wandfläche öffnet genau diese Fläche – auch ein schmales Seitenteil oder eine Raumwand. Ein Doppelklick auf ein Bild öffnet dessen Wand und wählt das Bild gleich aus.
- **E** öffnet die Wand der aktuellen Auswahl (ausgewählte Wand oder ausgewähltes Werk).
- Im **Properties-Panel** wählst du bei einer Stellwand eine der vier Seiten, bei einem Werk **Wand im 2D-Editor öffnen**. Unter **Controls** stehen alle Wände des Raums mit der Zahl ihrer Werke.
- Im Editor öffnest du über den **Wandnamen oben** jede andere Wand.

**Fertig**, **Esc** oder **3D-Ansicht** bringt dich zurück in den Raum – die Kamera fliegt an die Stelle zurück, von der du gekommen bist.

Oben wechselst du bei Stellwänden zwischen den vier Seiten (die Zahl zeigt, wie viele Werke dort hängen) und benennst die Wand über den Stift um.

## Werke platzieren, auswählen und verschieben

- Zieh ein Werk aus der **Asset-Bibliothek** direkt auf die Wand. Stellwände müssen dafür gesperrt sein; ist das nicht der Fall, sperrst du sie mit einem Klick oben in der Leiste.
- Ein **Klick** wählt ein Werk aus, **⇧ + Klick** nimmt weitere dazu, ein aufgezogener Rahmen wählt alles darin. **⌘/Strg + A** wählt alle Werke dieser Fläche.
- Beim Ziehen rasten Werke an Kanten und Mitten der anderen Werke ein, an Wandkanten und Wandmitte, an der Hängehöhe, an Hilfslinien und an gleichen Abständen. Rote Linien zeigen die Ausrichtung, pinke Marken gleiche Abstände.
- **⇧** hält die Bewegung waagrecht oder senkrecht, **⌘/Strg** schaltet das Einrasten kurz aus.
- **Pfeiltasten** verschieben um 1 cm, mit **⇧** um 10 cm, mit **Alt** um 1 mm.
- **Entf** entfernt die ausgewählten Werke aus der Ausstellung; **⌘/Strg + Z** macht jeden Schritt rückgängig.

## Ausrichten, verteilen, Abstände

Das rechte Panel arbeitet immer mit der aktuellen Auswahl:

- Sechs Knöpfe richten **links, mittig, rechts, oben, mittig, unten** aus – wahlweise **zueinander** oder **an der Wand**. Ein einzelnes Werk richtet sich immer an der Wand aus.
- **Horizontaler** und **vertikaler Abstand** setzen den Abstand zwischen den ausgewählten Werken auf einen festen Wert in Zentimetern. Das linke beziehungsweise obere Werk bleibt dabei stehen.
- Der Knopf daneben **verteilt** drei oder mehr Werke gleichmäßig zwischen dem ersten und dem letzten.
- Liegen mehrere ausgewählte Werke in einer Reihe, erscheinen zwischen ihnen pinke **Abstandsmarken**. Ziehst du eine davon, ändern sich alle Abstände gleichzeitig.
- Unter **Position** trägst du die Werte direkt ein: Abstand zur linken und rechten Wandkante sowie Unterkante, Mitte und Oberkante über dem Boden.

## Hängehöhe

Die gestrichelte Linie zeigt die Hängehöhe – die Höhe der Bildmitte über dem Boden, standardmäßig 150 cm. Du kannst den Wert im Panel ändern; er bleibt für deine nächsten Sitzungen gespeichert.

- **Mitten auf Linie** setzt jede Bildmitte der Auswahl auf diese Höhe.
- **Gruppe auf Linie** setzt die Mitte der ganzen Gruppe darauf – so hängst du Petersburger Gruppen mittig ein.

## Lineale, Hilfslinien und Messen

- Die **Lineale** oben und links zeigen Zentimeter ab der linken Wandkante und ab dem Boden. Die aktuelle Auswahl ist darauf blau markiert.
- Ziehst du aus einem Lineal in die Fläche, entsteht eine **Hilfslinie**, an der Werke einrasten. Zurück auf das Lineal gezogen verschwindet sie wieder.
- Mit dem Werkzeug **Messen (M)** zeigt ein Werk, über das du fährst, die Höhe von **Unterkante (UK)**, **Bildmitte** und **Oberkante (OK)** über dem Boden sowie die Abstände zu seinen Nachbarn, zur Wandkante und zu Fenstern und Türen. Durch Ziehen misst du eine beliebige Strecke, mit **⇧** genau waagrecht oder senkrecht. Ein Klick auf den Messwert entfernt ihn wieder.
- **Alt** halten zeigt im Auswahl-Werkzeug die Abstände der Auswahl zu dem Werk unter dem Mauszeiger – oder, wenn dort nichts liegt, zu Nachbarn, Wandkanten und Boden.
- In der Werkzeugleiste unten blendest du Höhen über dem Boden, die Abstände zwischen allen Werken, die Hängehöhe und die Lineale ein und aus.

## Ansicht und Maßstab

Scrollen verschiebt die Ansicht, **⌘/Strg + Scrollen** oder eine Pinch-Geste zoomt. Mit gedrückter Leertaste oder der mittleren beziehungsweise rechten Maustaste greifst du die Ansicht. **⇧1** passt die ganze Wand ein, **⇧2** die Auswahl. Der Maßstab oben (zum Beispiel 1:20) gilt für einen Bildschirm mit 96 dpi.

## Warnungen

- Ein **orange gestrichelter Rahmen** heißt: Das Werk ragt über die Wand hinaus.
- Ein **rot gestrichelter Rahmen** heißt: Das Werk überlappt ein anderes Werk oder ein Fenster beziehungsweise eine Tür.

## Tastenkürzel

| Taste | Funktion |
|---|---|
| `E` | Wand der Auswahl im 2D-Editor öffnen |
| `V` / `H` / `M` | Auswählen / Ansicht verschieben / Messen |
| `⇧ + Klick` | Mehrfachauswahl |
| `⌘/Strg + A` | Alle Werke der Fläche auswählen |
| `⇧` beim Ziehen | Nur waagrecht oder senkrecht |
| `⌘/Strg` beim Ziehen | Einrasten aus- bzw. einschalten |
| `Alt` halten | Abstände zur Auswahl anzeigen |
| Pfeiltasten | 1 cm (mit `⇧` 10 cm, mit `Alt` 1 mm) |
| `Entf` | Auswahl aus der Ausstellung entfernen |
| `⌘/Strg + Z` | Rückgängig |
| `⇧1` / `⇧2` | Wand / Auswahl einpassen |
| `+` / `−` | Zoomen |
| `Esc` | Auswahl aufheben, dann zurück in die 3D-Ansicht |
