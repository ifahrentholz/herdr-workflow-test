# PRD: Minimal spielbares Snakegame im Browser

## Problem Statement

Der Nutzer möchte ein minimal spielbares Snakegame erstellen, das direkt im Browser läuft. Das Spiel soll ohne Framework und ohne Build-Prozess auskommen, damit es einfach lokal geöffnet, verstanden und später erweitert oder statisch gehostet werden kann.

## Solution

Es wird eine statische Browser-Anwendung mit HTML, CSS und JavaScript gebaut. Das Spiel rendert über ein HTML-Canvas ein klassisches Snake-Spielfeld im Retro-Look. Die Spielerin oder der Spieler startet das Spiel per Button oder Leertaste, steuert die Snake mit Pfeiltasten oder WASD, sammelt Futter, erhöht damit Score und Geschwindigkeit, und kann nach Game Over direkt neu starten. Ein lokaler Highscore wird im Browser gespeichert.

## User Stories

1. Als Spieler möchte ich das Spiel im Browser öffnen können, damit ich ohne Installation spielen kann.
2. Als Spieler möchte ich einen klaren Startzustand sehen, damit ich weiß, wie ich das Spiel beginne.
3. Als Spieler möchte ich das Spiel per Start-Button starten können, damit der Spielbeginn kontrolliert ist.
4. Als Spieler möchte ich das Spiel per Leertaste starten können, damit ich nicht zur Maus wechseln muss.
5. Als Spieler möchte ich die Snake mit den Pfeiltasten steuern können, damit die Steuerung intuitiv ist.
6. Als Spieler möchte ich die Snake mit WASD steuern können, damit ich eine alternative Tastatursteuerung habe.
7. Als Spieler möchte ich nicht direkt in die Gegenrichtung lenken können, damit die Snake nicht durch eine unfaire Sofortkollision stirbt.
8. Als Spieler möchte ich Futter auf dem Spielfeld sehen, damit ich ein klares Ziel habe.
9. Als Spieler möchte ich, dass die Snake wächst, wenn sie Futter frisst, damit Fortschritt sichtbar wird.
10. Als Spieler möchte ich einen Score sehen, damit ich meinen aktuellen Fortschritt kenne.
11. Als Spieler möchte ich einen gespeicherten Highscore sehen, damit ich meine beste Leistung vergleichen kann.
12. Als Spieler möchte ich, dass der Highscore lokal im Browser gespeichert bleibt, damit er nach einem Neuladen noch vorhanden ist.
13. Als Spieler möchte ich, dass die Snake beim Verlassen des Spielfeldrands auf der gegenüberliegenden Seite wieder auftaucht, damit das Spiel Wrap-around-Regeln verwendet.
14. Als Spieler möchte ich verlieren, wenn die Snake in ihren eigenen Körper fährt, damit das Spiel eine klare Herausforderung hat.
15. Als Spieler möchte ich nach Game Over meinen Score sehen, damit ich mein Ergebnis kenne.
16. Als Spieler möchte ich nach Game Over per Button neu starten können, damit ich schnell erneut spielen kann.
17. Als Spieler möchte ich nach Game Over per Leertaste neu starten können, damit ich ohne Maus weiterspielen kann.
18. Als Spieler möchte ich, dass das Spiel mit steigender Punktzahl schneller wird, damit die Schwierigkeit zunimmt.
19. Als Spieler möchte ich, dass die Geschwindigkeit nur sanft und begrenzt steigt, damit das Spiel herausfordernd, aber nicht unfair wird.
20. Als Spieler möchte ich ein klares Retro-Design mit dunklem Hintergrund, grüner Snake und rotem Futter sehen, damit das Spiel visuell verständlich und ansprechend ist.
21. Als Entwickler möchte ich die Spiellogik getrennt von Rendering und Eingabe halten, damit sie testbar und wartbar bleibt.
22. Als Entwickler möchte ich eine einfache Drei-Dateien-Struktur verwenden, damit das Projekt leicht nachvollziehbar bleibt.

## Implementation Decisions

- Die Anwendung wird als statische Seite mit reinem HTML, CSS und JavaScript umgesetzt.
- Es wird kein Framework und kein Build-Setup verwendet.
- Die Dateistruktur besteht aus einer einfachen UI-Shell, Styling und JavaScript-Logik.
- Das Spiel wird auf einem HTML-Canvas gerendert.
- Das Spielfeld verwendet standardmäßig ein 20×20-Grid.
- Die Canvas-Darstellung verwendet eine Zellgröße von ca. 24px, also ca. 480×480px Spielfläche.
- Die Steuerung unterstützt Pfeiltasten und WASD.
- Direkte 180°-Richtungswechsel werden verhindert.
- Der Spielstart erfolgt per Start-Button oder Leertaste.
- Nach Game Over wird ein Status/Overlay mit Score angezeigt.
- Neustart erfolgt per Restart-Button oder Leertaste.
- Randverhalten ist Wrap-around: Die Snake erscheint auf der gegenüberliegenden Seite wieder.
- Game Over entsteht durch Kollision mit dem eigenen Körper.
- Der Score steigt beim Fressen von Futter.
- Futter erscheint zufällig auf freien Grid-Zellen und nicht auf der Snake.
- Die Geschwindigkeit startet bei ca. 7 Bewegungen pro Sekunde.
- Alle 5 Punkte steigt die Geschwindigkeit sanft.
- Die Maximalgeschwindigkeit liegt bei ca. 14 Bewegungen pro Sekunde.
- Der Highscore wird lokal im Browser via `localStorage` gespeichert.
- Das visuelle Design ist Retro dunkel/grün mit rotem Futter und klarer Score-Leiste.
- Die Game-State-/Snake-Logik soll als möglichst isolierter, testbarer Bereich modelliert werden.

## Testing Decisions

- Tests sollen primär externes Verhalten der Game-Logik prüfen, nicht interne Implementierungsdetails.
- Besonders testwürdig sind:
  - Initialisierung des Spielzustands
  - Richtungswechsel inklusive Verbot direkter 180°-Umkehr
  - Bewegung der Snake
  - Wrap-around am Rand
  - Futteraufnahme und Wachstum
  - zufällige Futterplatzierung auf freien Zellen
  - Selbstkollision und Game Over
  - Score-Erhöhung
  - Geschwindigkeitsberechnung abhängig vom Score
  - Highscore-Aktualisierung über eine abstrahierte Storage-Schnittstelle oder testbaren Wrapper
- Canvas-Rendering und Tastaturinput werden für den minimalen Scope vorrangig manuell geprüft, außer ein leichtgewichtiges Testsetup wird explizit ergänzt.
- Wenn noch keine Testinfrastruktur existiert, soll für die isolierte Game-Logik ein minimales Testsetup eingerichtet werden.

## Out of Scope

- Mobile Touch-Steuerung
- Soundeffekte oder Musik
- Mehrere Level oder Hindernisse
- Backend oder Online-Highscore
- Benutzerkonten
- Multiplayer
- Deployment/Hosting-Automatisierung
- Framework-Migration zu React/Vite
- Aufwendige Animationen oder Partikeleffekte
- Skins/Themes jenseits des Retro-Designs

## Further Notes

- Der erste Zielzustand ist ein minimal spielbares, lokal ausführbares Browsergame.
- Das Spiel soll später leicht erweiterbar sein, aber der erste Scope bleibt bewusst klein.
- Der wichtigste Qualitätsfokus liegt auf korrekt testbarer Spiellogik und einer klaren Nutzerführung für Start, Spiel, Game Over und Restart.
