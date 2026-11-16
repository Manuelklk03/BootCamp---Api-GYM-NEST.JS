# Respuestas de la entrega FitVal

## Ejercicio 0: protección de main

GitHub rechazó el push directo con estas líneas:

```text
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - 2 of 2 required status checks are expected.
```

La regla `proteger-main` exige una PR y los checks `htmlhint` y `lint`, y bloquea borrados y force pushes. Para probarla se creó un commit vacío aislado con `git commit-tree`, sin mover ninguna rama local; por eso no fue necesario usar `git reset --hard`.

## Pregunta 1: PostgreSQL no disponible

El cliente recibe `500` con `{"statusCode":500,"message":"Internal server error"}`. En la terminal aparece `ECONNREFUSED`, las direcciones y el puerto de conexión, además de la traza del error; ese detalle ayuda a diagnosticar el fallo sin exponer la configuración interna al cliente.

Comprobado con la API compilada en el puerto 3100 y sin PostgreSQL escuchando en el 5434. Docker no está disponible en este equipo: quedan pendientes la carga del esquema, la respuesta `200` con la base real y la secuencia `docker compose stop` / `docker compose start`. Los tests automatizados comprueban el `200`, el `500` genérico y la recuperación con un doble de prueba del `Pool`.
