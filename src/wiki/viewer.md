# Viewer-Modus (Öffentlicher Rundgang)

Der Viewer-Modus ist die Ansicht für deine Besucher. Er benötigt keine Anmeldung und funktioniert direkt im Webbrowser.

## Navigation im Raum
Besucher bewegen sich aus der Ego-Perspektive (First-Person) durch die Ausstellung:
- **Blickfeld:** Wird mit der Maus gesteuert (Pointer Lock).
- **Bewegung:** Erfolgt über die Tasten `W`, `A`, `S`, `D` oder die Pfeiltasten.
- **Physik:** Die integrierte Physik-Engine (Rapier) verhindert, dass Besucher durch Wände, Kunstwerke oder modulare Wände laufen können.

## Auf Handy und Tablet
Auf Smartphones und Tablets erscheinen statt Maus und Tastatur zwei Joysticks: Der **linke** unten links lässt dich gehen (je weiter ausgelenkt, desto schneller), der **rechte** unten rechts dreht den Blick. Beide lassen sich gleichzeitig benutzen, im Hoch- wie im Querformat. **Tippen zum Betreten** startet den Rundgang, der Pfeil oben links führt zurück zum Startbild.

Ein Fadenkreuz gibt es dort nicht: **Tippe ein Kunstwerk an**, um seine Informationen oben einzublenden; ein Tipp ins Leere oder das ✕ schließt sie wieder. Ein lesbares Buch öffnet sich per Tipp, wenn du davor stehst (etwa 2,5 m), sonst steht dort **Näher herangehen zum Lesen**.

## Interaktion mit Kunstwerken
In der Bildschirmmitte befindet sich ein Fadenkreuz. 
Sobald ein Besucher ein Kunstwerk fokussiert und interagiert (Klick), öffnet sich ein elegantes **Info-Overlay**. Hier werden alle Metadaten wie Titel, Künstler, Beschreibung und die realen Maße des Kunstwerks präsentiert.


## Bücher lesen
Liegt ein Buch auf einem Sockel und ist es als **im öffentlichen Viewer lesbar** freigegeben, erscheint beim Näherkommen (etwa 2,5 m) der Hinweis **Klicken zum Lesen**. Ein Klick schlägt das Buch auf; geblättert wird mit der Maus oder den Pfeiltasten, **Esc** schließt es wieder.

## In AR ansehen
Ist für die veröffentlichte Version ein AR-Export fertig, erscheint im Viewer der Knopf **In AR ansehen**. Auf dem iPhone und iPad öffnet sich die Ausstellung in der AR-Ansicht von iOS, auf Android im Scene Viewer. Am Computer zeigt der Knopf einen QR-Code, den man mit dem Handy scannt. Das Modell startet in echter Größe und lässt sich im Raum verschieben und skalieren. Gaussian Splats sind im AR-Export nicht enthalten.

## Andere Besucher*innen

Oben rechts steht, wie viele Personen gerade in der Ausstellung sind. Die anderen siehst du als bunte Schleim-Blobs im Raum, die dir beim Gehen nachziehen (siehe **Zusammenarbeit**).

## Qualität und Renderer
Auf dem Startbildschirm des Rundgangs lassen sich **Qualität** und **Renderer** wählen. CuraHub nutzt WebGPU, wenn der Browser es unterstützt, sonst WebGL.
