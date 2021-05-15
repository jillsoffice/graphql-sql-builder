// @ts-nocheck

import fc from 'fast-check';
import {
    DocumentNode,
    FieldDefinitionNode,
    graphql,
    ObjectTypeDefinitionNode
} from 'graphql';
import { graphqlPromise } from '../../../graphql/graphql';
import {
    getObjectTypeDefinitionNodeForTypeName,
    getTypeNameFromTypeNode,
    isFieldDefinitionNodeAnEnum,
    isFieldDefinitionNodeARelation,
    isTypeNameARelation
} from '../../../graphql/utilities';
import { GraphQLArbitraryResult, JOObjectTypeName } from '../../../types';
import { getCreateMutationArbitrary } from './create-mutation-arbitrary';
import { enumArbitrary } from './enum-arbitrary';

// TODO this file and function should probably be renamed to input-value-arbitrary

let exampleRelations = {};

// TODO I do not think this will need to be async once we can generate a create input arbitrary
export async function getFieldDefinitionNodeArbitrary(
    documentNode: Readonly<DocumentNode>,
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>,
    fieldDefinitionNode: Readonly<FieldDefinitionNode>
): Promise<fc.Arbitrary<any>> {
    const typeName: string = getTypeNameFromTypeNode(fieldDefinitionNode.type);

    if (typeName === 'Int') {
        return fc.nat();
    }

    if (typeName === 'String') {
        return fc.string();
    }

    if (typeName === 'DateTime') {
        return fc.date({
            min: new Date(0),
            max: new Date()
        }).map((date: Date) => {
            return date.toISOString();
        });
    }

    if (typeName === 'Boolean') {
        return fc.boolean();
    }

    if (isFieldDefinitionNodeARelation(documentNode, fieldDefinitionNode) === true) {
        console.log('typeName', typeName);

        // console.log('exampleRelations[typeName]', exampleRelations[typeName]);

        // if (exampleRelations[typeName] !== undefined) {
        //     // return exampleRelations[typeName];

        //     return fc.boolean().map((_) => {
        //         return () => {
        //             return exampleRelations[typeName];
        //         };
        //     });
        // }
        // else {
            // exampleRelations[typeName] = '';

            const relationObjectTypeDefinitionNode = getObjectTypeDefinitionNodeForTypeName(documentNode, typeName as JOObjectTypeName);

            const graphqlArbitraryResultPromise = fc.sample(await getCreateMutationArbitrary(
                documentNode,
                relationObjectTypeDefinitionNode,
                'SCALAR'
            ))[0];
    
            const graphqlArbitraryResult = await graphqlArbitraryResultPromise();
    
            // console.log('graphqlArbitraryResult', graphqlArbitraryResult);
    
            const graphql = await graphqlPromise;
            const result = await graphql.query(graphqlArbitraryResult.query);
    
            const connectionQuery = `
                {
                    connect: {
                        id: ${result.data[graphqlArbitraryResult.queryName].id}
                    }
                }
            `;

            console.log('connectionQuery', connectionQuery);

            // exampleRelations[typeName] = connectionQuery;

            return fc.boolean().map((_) => {
                return () => {
                    return connectionQuery;
                };
            });
    
            // TODO we can just generate a specific create input arbitrary here, making this process a lot simpler
        // }
    }

    if (isFieldDefinitionNodeAnEnum(documentNode, fieldDefinitionNode) === true) {
        return enumArbitrary(
            documentNode,
            getTypeNameFromTypeNode(fieldDefinitionNode.type)
        );
    }

    throw new Error(`Type ${typeName} has no arbitrary implementation`);
}