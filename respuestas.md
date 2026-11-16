# Respuestas de la entrega FitVal

## Ejercicio 0: protección de main

GitHub rechazó el push directo con estas líneas:

```text
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - 2 of 2 required status checks are expected.
```

La regla `proteger-main` exige una PR y los checks `htmlhint` y `lint`, y bloquea borrados y force pushes. Para probarla se creó un commit vacío aislado con `git commit-tree`, sin mover ninguna rama local; por eso no fue necesario usar `git reset --hard`.
