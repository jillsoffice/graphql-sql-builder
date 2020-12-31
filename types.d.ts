import { GraphQLResolveInfo } from 'graphql';

export type JOTableName = string;
export type JOObjectTypeName = string;

export type Users = Readonly<{
    id: number;
}>;

export type SQLInput = {
    readonly sql: string;
    readonly values?: {
        readonly [key: string]: any;
    };
    readonly columnHashes?: Readonly<ColumnHashes>;
    readonly dependentSQLCreator?: (entityId: number) => ReadonlyArray<SQLInput>
};

export type ColumnHashes = {
    readonly [columnHash: string]: string;
};

export type SelectAndJoinClauseInfo = {
    readonly joinSQLInput: Readonly<SQLInput>;
    readonly tableName: JOTableName;
};

export type JOGraphQLResolvers = {
    [resolverName: string]: JOGraphQLResolver;
};

export type JOGraphQLResolver = any;

export type GraphQLVariables = {
    readonly [key: string]: any;
};

export type JOGraphQLFilter = {
    readonly ne?: any;
    readonly eq?: any;
    readonly le?: any;
    readonly lt?: any;
    readonly ge?: any;
    readonly gt?: any;
    readonly in?: any;
    readonly contains?: any;
    readonly startsWith?: any;
    readonly endsWith?: any;
};

export type SelectionConfig = {
    readonly type: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY';
    readonly entityTableName: JOTableName;
    readonly relationTableName: JOTableName;
    readonly joinTableName?: JOTableName;
    readonly relationTypeName: JOObjectTypeName;
    readonly entityKey: string;
    readonly relationKey: string;
    readonly relationGQLFieldName?: string;
};

export type JOContext = {
    headers: Headers;
    responseHeaders: Headers;
    user: Users;
    readonly variables: Readonly<GraphQLVariables>;
    readonly transactionId?: string;
    res: any; // TODO make this the express res type thing
};

export type JOGraphQLArgs = {
    readonly [key: string]: any;
};

export type SQLBuilderConfig = {
    [selectionSetName: string]: Readonly<SelectionConfig> | undefined;
};

export type BaseSQLFunction = (
    objectTypeName: JOObjectTypeName,
    tableName: JOTableName,
    args: Readonly<JOGraphQLArgs>,
    context: Readonly<JOContext>,
    info: Readonly<GraphQLResolveInfo>
) => any;

export type DerivedSQLFunction = (
    resolverName: string,
    args: Readonly<JOGraphQLArgs>,
    context: Readonly<JOContext>,
    info: Readonly<GraphQLResolveInfo>
) => any;

export type NestedOperationName = 
| 'create'
| 'createMany'
| 'update'
| 'updateMany'
| 'upsert'
| 'upsertMany'
| 'delete'
| 'deleteMany';

export type RelationIDInput = {
    readonly id?: Maybe<Scalars['Int']>;
    readonly ids?: Maybe<ReadonlyArray<Scalars['Int']>>;
};

export type PageRequest = {
    readonly limit?: Maybe<Scalars['Int']>;
    readonly offset?: Maybe<Scalars['Int']>;
};

/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
    ID: string;
    String: string;
    Boolean: boolean;
    Int: number;
    Float: number;
    DateTime: any;
};

export type Maybe<T> = T | null;

export type OrderByInput = {
    readonly field: Scalars['String'];
    readonly order: SortDirectionEnum;
    readonly in?: Maybe<ReadonlyArray<Scalars['Int']>>;
};

export type SortDirectionEnum = 
  | 'DESC'
  | 'ASC';

export type RelationInput = {
    readonly connect?: Maybe<RelationIDInput>;
    readonly disconnect?: Maybe<RelationIDInput>;
};