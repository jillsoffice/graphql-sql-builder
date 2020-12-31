import {
    JOTableName,
    SQLBuilderConfig
} from './types.d';

export const SQLBuilderConfigs: {
    [key in JOTableName]?: Readonly<SQLBuilderConfig> | undefined;
} = {};