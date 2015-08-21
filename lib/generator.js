import PostgresSchema from 'pg-json-schema-export';
import Promise from 'bluebird';
import fs from 'fs';
import pluralize from 'pluralize';
import capitalize from 'capitalize';

let promisedWriteFile = Promise.promisify(fs.writeFile);
let outputFilename = './pg-schema.json';

fs.mkdir('./graphql', function(e){
    if(!e || (e && e.code === 'EEXIST')){
        //do something with contents
    } else {
        //debug
        console.log(e);
    }
});

function* entries(obj) {
  for (let key of Object.keys(obj)) {
    yield [key, obj[key]];
  }
}

function collectTypeDataFromDBTable(table, relationshipConfig) {
  let name = pluralize(capitalize.words(table.table_name), 1).replace(/_/gi, '');
  let description = table.obj_description || `A ${name} object`;
  let columns = table.columns;
  let extraImports = [];

  console.log(`Generating type: ${name}`);

  let fields = Object.keys(columns).filter(key => {
    return (key !== 'created_at' && key !== 'updated_at' && key !== 'password');
  }).map(key => {
    return collectFieldDataFromDBTableColumn(columns[key]);
  });

  if (relationshipConfig) {
    for (let [key, values] of entries(relationshipConfig)) {
      fields = fields.concat(values.map(value => {
        let relationshipField = collectFieldDataFromRelationshipConfig(key, value);
        if (relationshipField.extraImport !== `${name}Type`) {
          extraImports.push(relationshipField.extraImport);
        }
        return relationshipField;
      }));
    }
  }

  return {
    name,
    description,
    fields,
    extraImports
  };

}

function collectFieldDataFromDBTableColumn(column, typeName) {
  let name = column.column_name;
  let description = column.col_description || `The ${name} of ${typeName}`;
  let type;

  switch (column.data_type) {
    case 'integer':
      type = 'GraphQLInt';
      break;
    case 'float':
      type = 'GraphQLFloat';
      break;
    case 'boolean':
      type = 'GraphQLBoolean';
      break;
    default:
      type = 'GraphQLString';
  }

  return {
    name,
    description,
    type
  };
}

function collectFieldDataFromRelationshipConfig(relationshipType, config) {
  if (typeof config === 'string') {
    config = {
      table: config,
      field: config
    };
  }

  let name = config.field;
  let type = pluralize(capitalize.words(config.table), 1).replace(/_/gi, '');
  let extraImport = type + 'Type';

  if (relationshipType !== 'oneToOne') {
    type = `new GraphQLList(${type}Type)`;
  } else {
    type = type + 'Type';
  }

  return {
    type,
    name,
    needResolve: true,
    extraImport
  };
}

export default {

  generateSchema(connection) {

    console.log('Generating schema...');

    return PostgresSchema.toJSON(connection, 'public');
  },

  saveSchema(connection) {

    this.generateSchema(connection)
    .then(schema => {
      return promisedWriteFile(outputFilename, JSON.stringify(schema, null, 4))
      .then(() => {
        return true;
      });
    })
    .catch(function (error) {
      console.log('There was an error', error);
    });
  },

  generateTypes(config) {

    let {connection, relationships, skipTables} = config;

    return this.generateSchema(connection)
    .then(schema => {
      console.log('Generating types...');

      let types = [];

      for (let [key, value] of entries(schema.tables)) {
        if (skipTables.indexOf(key) === -1) {
          types.push(collectTypeDataFromDBTable(value, relationships[key]));
        }
      }

      // console.log(JSON.stringify(types, null, 4));
      return types;

    })
    .then(types => {

      console.log('Generating files...');

      return Promise.map(types, type => {

        let extraImports = '';

        if (type.extraImports.length > 0) {
          extraImports = type.extraImports.map(typeToImport => {
            return `import ${typeToImport} from './${typeToImport}.js';`;
          }).join('\n');
        }

        let fieldsResult = type.fields.map(field => {
          if (field.needResolve) {

            return `
    ${field.name}: {
      type: ${field.type},
      description: '${field.description}',
      resolve: (${type.name.toLowerCase()}) => {
        return ${type.name}.forge({id: ${type.name.toLowerCase()}.id})
        .fetch({withRelated: ['${field.name}']})
        .then(${type.name.toLowerCase()} => ${type.name.toLowerCase()}.toJSON().${field.name});
      }
    }`;
          } else {
            return `
    ${field.name}: {
      type: ${field.type},
      description: '${field.description}'
    }`;
          }
        }).join(',');

        let result =`
import {
  graphql,
  GraphQLInt,
  GraphQLString,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
  GraphQLObjectType
} from 'graphql';

${extraImports}

import ${type.name} from '../../app/models/${type.name}.js';

let ${type.name}Type = new GraphQLObjectType({
  name: '${type.name}',
  description: '${type.description}',
  fields: () => ({
    ${fieldsResult}
  })
});

export default ${type.name}Type;
`;

        return {
          name: type.name,
          content: result
        };

      });
    })
    .then(typeResults => {
      return Promise.map(typeResults, (type) => {
        console.log(`Writing ${type.name}...`);
        let outputFilename = `./graphql/${type.name}Type.js`;
        return promisedWriteFile(outputFilename, type.content).then(() => type.name);
      });
    })
    .then(generatedTypes => {
      console.log('Generating schema.js file...');

      let schemaFilename = './graphql/schema.js';

      let imports = generatedTypes.map(type => {
        return `
import ${type}Type from './${type}Type.js';
import ${type} from '../../app/models/${type}.js';`;
      }).join('\n');

      let fields = generatedTypes.map(type => {
        let camelCaseType = type.charAt(0).toLowerCase() + type.slice(1);
        return `
    ${camelCaseType}: {
      type: ${type}Type,
      args: {
        id: {
          name: 'id',
          type: new GraphQLNonNull(GraphQLInt)
        }
      },
      resolve: (root, {id}) => {
        return new ${type}({id})
        .fetch()
        .then(${camelCaseType} => ${camelCaseType}.toJSON());
      }
    }`;
  }).join(',');

      let result = `import {
  GraphQLObjectType,
  GraphQLInt,
  GraphQLNonNull,
  GraphQLSchema
} from 'graphql';

${imports}

let queryType = new GraphQLObjectType({
  name: 'Query',
  fields: () => ({
    ${fields}
  })
});

export default new GraphQLSchema({
  query: queryType
});`;

      return promisedWriteFile(schemaFilename, result).then(() => true);
    });
  }
};
