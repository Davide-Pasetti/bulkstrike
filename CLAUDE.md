## Workflow Git
- Al termine di ogni modifica o task completato, fai sempre git add, git commit (con un messaggio conventional commit, es. "fix:", "feat:") e git push su main automaticamente, senza chiedere conferma.
- Fai questo solo dopo aver verificato che la build (npm run build) sia verde.
- Se la build fallisce, non fare commit/push: correggi prima l'errore.
