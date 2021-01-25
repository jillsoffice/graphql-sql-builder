// TODO be careful! There are two copies of this file right now, one in jills-office-web and one in jills-office-node
// TODO the one in jills-office-node is now really old and ugly, the one in jills-office-web is cleaned up
// TODO I'm thinking we should move this file to jills-office-node, in the graphql directory
// TODO allow command-line parameters to set paths and such

import * as ts from 'typescript';
import * as fs from 'fs';
import {
    parse,
    DocumentNode,
    OperationDefinitionNode,
    FieldNode,
    SelectionNode,
    SelectionSetNode,
    ObjectTypeDefinitionNode,
    FieldDefinitionNode
} from 'graphql';
import { JOObjectTypeName } from '../jills-office-node/types/index.d';
import {
    getObjectTypeDefinitionNodeForTypeName,
    getModelObjectTypeDefinitionNodes,
    getTypeNameFromTypeNode,
    getObjectTypeNameFromQuery,
    isQueryAFindQuery,
    isFieldNodeARelation,
    isFieldNodeAListType,
    isTypeANullableType,
    getFieldDefinitionNodeForFieldNode
} from '../jills-office-node/graphql/utilities';

const model: string = fs.readFileSync('../jills-office-node/graphql/schema.graphql').toString();
const GraphQLSchemaDocumentNode: Readonly<DocumentNode> = parse(model);

(async () => {
    const configFile: Readonly<ts.TsConfigSourceFile> = ts.readJsonConfigFile('./tsconfig.json', ts.sys.readFile);
    const parsedConfigFile: Readonly<ts.ParsedCommandLine> = ts.parseJsonSourceFileConfigFileContent(configFile, ts.sys, './');

    const program: Readonly<ts.Program> = ts.createProgram(parsedConfigFile.fileNames, {});
    const sourceFiles: ReadonlyArray<ts.SourceFile> = program.getSourceFiles();

    const modelObjectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode> = getModelObjectTypeDefinitionNodes(GraphQLSchemaDocumentNode.definitions);
    const objectTypeNames: ReadonlyArray<JOObjectTypeName> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => {
        return objectTypeDefinitionNode.name.value as JOObjectTypeName;
    });

    const generatedTypeScriptImports: string = objectTypeNames.map((objectTypeName: JOObjectTypeName) => {
        return `import { ${objectTypeName} } from '../jills-office-node/types/graphql.d';`;
    }).join('\n');
    const generatedTypeScriptTypes: string = generateTypeScriptTypesForSourceFiles(sourceFiles);
    const generatedTypeScriptFileContents: string = `${generatedTypeScriptImports}${generatedTypeScriptTypes}`;

    fs.writeFileSync('./graphql-queries.d.ts', generatedTypeScriptFileContents);
})();

function generateTypeScriptTypesForSourceFiles(
    sourceFiles: ReadonlyArray<ts.SourceFile>,
    generatedTypeScriptTypes: string = ''
): string {
    if (sourceFiles.length === 0) {
        return generatedTypeScriptTypes;
    }

    const sourceFile: Readonly<ts.SourceFile> = sourceFiles[0];

    const generatedTypeScriptTypesForNodes: string = generateTypeScriptTypesForNodes(sourceFile, sourceFile.getChildren());

    return generateTypeScriptTypesForSourceFiles(
        sourceFiles.slice(1),
        `${generatedTypeScriptTypes}${generatedTypeScriptTypesForNodes}`
    );
}

function generateTypeScriptTypesForNodes(
    sourceFile: Readonly<ts.SourceFile>,
    nodes: ReadonlyArray<ts.Node>,
    generatedTypeScriptTypes: string = ''
): string {
    if (nodes.length === 0) {
        return generatedTypeScriptTypes;
    }

    const node: Readonly<ts.Node> = nodes[0];

    const generatedTypeScriptTypesForNode: string = generateTypeScriptTypesForNode(node);
    const generatedTypeScriptTypesForNodeChildren: string = generateTypeScriptTypesForNodes(sourceFile, node.getChildren(sourceFile));

    return generateTypeScriptTypesForNodes(
        sourceFile,
        nodes.slice(1),
        `${generatedTypeScriptTypes}${generatedTypeScriptTypesForNode}${generatedTypeScriptTypesForNodeChildren}`
    );
}

// TODO clean up types from here downward
function generateTypeScriptTypesForNode(node: Readonly<ts.Node>): string {

    if (
        ts.isTaggedTemplateExpression(node) &&
        (node.tag as any).escapedText === 'gql'
    ) {
        const queryText: string = (node.template as any).text;
        const documentNode: Readonly<DocumentNode> = parse(queryText);
        const operationDefinition: OperationDefinitionNode = documentNode.definitions[0] as OperationDefinitionNode;

        const topLevelFieldNode: Readonly<FieldNode> = operationDefinition.selectionSet.selections[0] as FieldNode;

        if (
            topLevelFieldNode.alias === null ||
            topLevelFieldNode.alias === undefined
        ) {
            return '';
        }

        const objectTypeName: JOObjectTypeName | 'NOT_FOUND' = getObjectTypeNameFromQuery(queryText);

        if (objectTypeName === 'NOT_FOUND') {
            return '';
        }

        const generatedTypeScriptTypeName: string = `\n\nexport type ${topLevelFieldNode.alias.value} = {`;

        const selectionSet: Readonly<SelectionSetNode> = isQueryAFindQuery(queryText) ? (topLevelFieldNode.selectionSet?.selections[0] as any).selectionSet : topLevelFieldNode.selectionSet;

        if (selectionSet === undefined) {
            return '';
        }

        const generatedTypeScriptTypeBody: string = generateTypeScriptTypesForSelections(selectionSet.selections, objectTypeName);

        const generatedTypeScriptTypeNameEnding: string = '\n};'

        return `${generatedTypeScriptTypeName}${generatedTypeScriptTypeBody}${generatedTypeScriptTypeNameEnding}`;
    }
    else {
        return '';
    }
}

function generateTypeScriptTypesForSelections(
    selectionNodes: ReadonlyArray<SelectionNode>,
    objectTypeName: JOObjectTypeName,
    level: number = 1,
    generatedTypeScriptTypes: string = ''
): string {
    if (selectionNodes.length === 0) {
        return generatedTypeScriptTypes;
    }

    const selectionNode: Readonly<SelectionNode> = selectionNodes[0];

    if (selectionNode.kind === 'Field') {
        const objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodeForTypeName(GraphQLSchemaDocumentNode, objectTypeName);
        const fieldNodeIsARelation: boolean = isFieldNodeARelation(GraphQLSchemaDocumentNode, objectTypeDefinitionNode, selectionNode);
        const fieldDefinitionNode: Readonly<FieldDefinitionNode> | 'NOT_FOUND' = getFieldDefinitionNodeForFieldNode(objectTypeDefinitionNode, selectionNode);

        if (fieldDefinitionNode === 'NOT_FOUND') {
            throw new Error(`No fieldDefinitionNode was found for selectionNode: ${JSON.stringify(selectionNode, null, 2)}`);
        }

        const fieldDefinitionNodeTypeIsNullable: boolean = isTypeANullableType(fieldDefinitionNode.type);
        const nullableCharacter: '?' | '' = fieldDefinitionNodeTypeIsNullable === true ? '?' : '';

        if (fieldNodeIsARelation === true) {
            return generateTypeScriptTypesForRelationFieldNode(
                selectionNodes,
                selectionNode,
                objectTypeName,
                level,
                generatedTypeScriptTypes,
                nullableCharacter,
                fieldDefinitionNode,
                objectTypeDefinitionNode
            );
        }
        else {
            return generateTypeScriptTypesForScalarFieldNode(
                selectionNodes,
                selectionNode,
                objectTypeName,
                level,
                generatedTypeScriptTypes,
                nullableCharacter
            );
        }
    }
    else {
        return generateTypeScriptTypesForSelections(
            selectionNodes.slice(1),
            objectTypeName,
            level,
            generatedTypeScriptTypes
        );
    }
}

function generateTypeScriptTypesForScalarFieldNode(
    selectionNodes: ReadonlyArray<SelectionNode>,
    selectionNode: Readonly<FieldNode>,
    objectTypeName: JOObjectTypeName,
    level: number,
    generatedTypeScriptTypes: string,
    nullableCharacter: '?' | ''
) {
    const generatedTypeScriptPropertyType: string = `\n${new Array(level * 4).fill(' ').join('')}readonly ${selectionNode.name.value}${nullableCharacter}: ${objectTypeName}['${selectionNode.name.value}'];`;
        
    return generateTypeScriptTypesForSelections(
        selectionNodes.slice(1),
        objectTypeName,
        level,
        `${generatedTypeScriptTypes}${generatedTypeScriptPropertyType}`
    );
}

function generateTypeScriptTypesForRelationFieldNode(
    selectionNodes: ReadonlyArray<SelectionNode>,
    selectionNode: Readonly<FieldNode>,
    objectTypeName: JOObjectTypeName,
    level: number,
    generatedTypeScriptTypes: string,
    nullableCharacter: '?' | '',
    fieldDefinitionNode: Readonly<FieldDefinitionNode>,
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>
) {
    const fieldNodeIsAListType: boolean = isFieldNodeAListType(objectTypeDefinitionNode, selectionNode);
    const readonlyPrefix: 'Readonly' | 'ReadonlyArray' = fieldNodeIsAListType === true ? 'ReadonlyArray' : 'Readonly';

    const generatedTypeScriptPropertyTypeOpen: string = `\n${new Array(level * 4).fill(' ').join('')}readonly ${selectionNode.name.value}${nullableCharacter}: ${readonlyPrefix}<{`;

    const generatedTypeScriptPropertyTypeBody: string = generateTypeScriptTypesForSelections(
        selectionNode.selectionSet?.selections || [],
        getTypeNameFromTypeNode(fieldDefinitionNode.type) as JOObjectTypeName,
        level + 1
    );

    const generatedTypeScriptPropertyTypeClose: string = `\n${new Array(level * 4).fill(' ').join('')}}>;`;
    
    return generateTypeScriptTypesForSelections(
        selectionNodes.slice(1),
        objectTypeName,
        level,
        `${generatedTypeScriptTypes}${generatedTypeScriptPropertyTypeOpen}${generatedTypeScriptPropertyTypeBody}${generatedTypeScriptPropertyTypeClose}`
    );
}
