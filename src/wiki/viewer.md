# Viewer-Modus (Öffentlicher Rundgang)

Der Viewer-Modus ist die Ansicht für deine Besucher. Er benötigt keine Anmeldung und funktioniert direkt im Webbrowser.

## Navigation im Raum
Besucher bewegen sich aus der Ego-Perspektive (First-Person) durch die Ausstellung:
- **Blickfeld:** Wird mit der Maus gesteuert (Pointer Lock).
- **Bewegung:** Erfolgt über die Tasten `W`, `A`, `S`, `D` oder die Pfeiltasten.
- **Physik:** Die integrierte Physik-Engine (Rapier) verhindert, dass Besucher durch Wände, Kunstwerke oder modulare Wände laufen können.

## Interaktion mit Kunstwerken
In der Bildschirmmitte befindet sich ein Fadenkreuz. 
Sobald ein Besucher ein Kunstwerk fokussiert und interagiert (Klick), öffnet sich ein elegantes **Info-Overlay**. Hier werden alle Metadaten wie Titel, Künstler, Beschreibung und die realen Maße des Kunstwerks präsentiert.


## Bücher lesen
Liegt ein Buch auf einem Sockel und ist es als **im öffentlichen Viewer lesbar** freigegeben, erscheint beim Näherkommen (etwa 2,5 m) der Hinweis **Klicken zum Lesen**. Ein Klick schlägt das Buch auf; geblättert wird mit der Maus oder den Pfeiltasten, **Esc** schließt es wieder.

## Andere Besucher*innen

Oben rechts steht, wie viele Personen gerade in der Ausstellung sind. Die anderen siehst du als bunte Schleim-Blobs im Raum, die dir beim Gehen nachziehen (siehe **Zusammenarbeit**).

## Qualität und Renderer
Auf dem Startbildschirm des Rundgangs lassen sich **Qualität** und **Renderer** wählen. CuraHub nutzt WebGPU, wenn der Browser es unterstützt, sonst WebGL.
