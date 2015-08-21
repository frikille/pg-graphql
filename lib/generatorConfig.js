import pgGraphqlGenerator from './generator.js';

let connection = {
  user: '',
  database: '',
  port: 5432,
  host: 'localhost',
  password: ''
};

/**
 * Config for additional fields on types based on relationships
 * @type {Object}
 *
 * Example:
 * let relationships = {
 *   users: {
 *     oneToMany: ['notifications', 'posts']
 *   },
 *   posts: {
 *     oneToMany: [{table: 'post_blocks', field: 'blocks'}, {table: 'post_likes', field: 'likes'}, {table: 'post_comments', field: 'comments'}],
 *     oneToOne: ['journal', {table: 'users', field: 'author'}]
 *   }
 * }
 */
let relationships = {};

/**
 * Table names that should not be included in type generation
 * @type {Array}
 *
 * Example:
 * let skipTables = ["knex_migrations"]
 */
let skipTables = [];

export default {
  run() {
    pgGraphqlGenerator.generateTypes({
      connection,
      relationships,
      skipTables
    }).then(result => {
      console.log('GraphQL types and schema generation finished');
    }).catch(error => {
      console.log('There was an error', error);
    });
  }
};
