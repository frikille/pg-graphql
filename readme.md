# GraphQL type generation from Postgresql database schema

The current setup is a bit specific and should be used with caution.

It generates GraphQL types based on a psql schema and some additional config. It also generates the resolve function for each type with the assumption that the app will use BookshelfJs for ORM. (There's a plan to make it more generic and adding this as a config option)

## Assumptions:
- The app uses knex.js and bookshelf.js for orm
