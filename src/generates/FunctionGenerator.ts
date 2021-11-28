import type * as tsc from "typescript";
import { Pair } from "tstl/utility/Pair";
import { Vector } from "tstl/container/Vector";

import { IRoute } from "../structures/IRoute";

export namespace FunctionGenerator
{
    export function generate(route: IRoute): string
    {
        const query: IRoute.IParameter | undefined = route.parameters.find(param => param.category === "query");
        const input: IRoute.IParameter | undefined = route.parameters.find(param => param.category === "body");

        return [head, body, tail]
            .map(closure => closure(route, query, input))
            .filter(str => !!str)
            .join("\n");
    }

    /* ---------------------------------------------------------
        BODY
    --------------------------------------------------------- */
    function body(route: IRoute, query: IRoute.IParameter | undefined, input: IRoute.IParameter | undefined): string
    {
        // FETCH ARGUMENTS WITH REQUST BODY
        const parameters = filter_parameters(route, query);
        const fetchArguments: string[] = 
        [
            "connection",
            `${route.name}.CONFIG`,
            `${route.name}.METHOD`,
            `${route.name}.path(${parameters.map(p => p.name).join(", ")})`
        ];
        if (input !== undefined)
            fetchArguments.push("input");

        // RETURNS WITH FINALIZATION
        return "{\n"
            + "    return Fetcher.fetch\n"
            + "    (\n"
            + fetchArguments.map(param => `        ${param}`).join(",\n") + "\n"
            + "    );\n"
            + "}";
    }

    function filter_parameters(route: IRoute, query: IRoute.IParameter | undefined): IRoute.IParameter[]
    {
        const parameters = route.parameters.filter(param => param.category === "param");
        if (query)
            parameters.push(query);
        return parameters;
    }

    /* ---------------------------------------------------------
        HEAD & TAIL
    --------------------------------------------------------- */
    function head(route: IRoute, query: IRoute.IParameter | undefined, input: IRoute.IParameter | undefined): string
    {
        //----
        // CONSTRUCT COMMENT
        //----
        // MAIN DESCRIPTION
        let comment: string = route.comments.map(comment => `${comment.kind === "linkText" ? " " : ""}${comment.text}`).join("");
        if (comment !== "")
            comment += "\n\n";

        // FILTER TAGS (VULNERABLE PARAMETERS WOULD BE REMOVED)
        const tagList: tsc.JSDocTagInfo[] = route.tags.filter(tag => tag.text !== undefined);
        if (tagList.length !== 0)
        {
            const index: number = tagList.findIndex(t => t.name === "param");
            if (index !== -1)
            {
                const capsule: Vector<tsc.JSDocTagInfo> = Vector.wrap(tagList);
                capsule.insert(capsule.nth(index), {
                    name: "param",
                    text: [
                        {
                            kind: "parameterName",
                            text: "connection"
                        },
                        {
                            kind: "space",
                            text: " "
                        },
                        { 
                            kind: "text",
                            text: "connection Information of the remote HTTP(s) server with headers (+encryption password)" 
                        }
                    ]
                });
            }
            comment += tagList
                .map(tag => `@${tag.name} ${tag.text!.map(elem => elem.text).join("")}`)
                .join("\n") + "\n\n";
        }
        
        // COMPLETE THE COMMENT
        comment += `@nestia Generated by Nestia - https://github.com/samchon/nestia\n`;
        comment += `@controller ${route.symbol}\n`;
        comment += `@path ${route.method} ${route.path}`;

        //----
        // FINALIZATION
        //----
        // REFORM PARAMETERS TEXT
        const parameters: string[] = 
        [
            "connection: IConnection",
            ...route.parameters.map(param => 
            {
                const type: string = (param === query || param === input)
                    ? `Primitive<${route.name}.${param === query ? "Query" : "Input"}>`
                    : param.type
                return `${param.name}: ${type}`;
            })
        ];

        // OUTPUT TYPE
        const output: string = route.output === "void"
            ? "void"
            : `${route.name}.Output`;

        // RETURNS WITH CONSTRUCTION
        return ""
            + "/**\n"
            + comment.split("\r\n").join("\n").split("\n").map(str => ` * ${str}`).join("\n") + "\n"
            + " */\n"
            + `export function ${route.name}\n` 
            + `    (\n` 
            + `${parameters.map(str => `        ${str}`).join(",\n")}\n`
            + `    ): Promise<${output}>`;
    }

    function tail(route: IRoute, query: IRoute.IParameter | undefined, input: IRoute.IParameter | undefined): string | null
    {
        // LIST UP TYPES
        const types: Pair<string, string>[] = [];
        if (query !== undefined)
            types.push(new Pair("Query", query.type));
        if (input !== undefined)
            types.push(new Pair("Input", input.type));
        if (route.output !== "void")
            types.push(new Pair("Output", route.output));
        
        // PATH WITH PARAMETERS
        const parameters = filter_parameters(route, query);
        let path: string = route.path;
        for (const param of parameters)
            if (param.category === "param")
                path = path.replace(`:${param.field}`, `\${${param.name}}`);
        path = (query !== undefined)
            ? `\`${path}?\${new URLSearchParams(${query.name} as any).toString()}\``
            : `\`${path}\``;

        return `export namespace ${route.name}\n`
            + "{\n"
            + 
            (
                types.length !== 0
                    ? types.map(tuple => `    export type ${tuple.first} = Primitive<${tuple.second}>;`).join("\n") + "\n\n"
                    : ""
            )
            + "\n"
            + `    export const METHOD = "${route.method}";\n`
            + `    export const PATH = "${route.path}";\n`
            + `    export const CONFIG = {\n`
            + `        input_encrypted: ${input !== undefined && input.encrypted},\n`
            + `        output_encrypted: ${route.encrypted},\n`
            + `    };\n`
            + "\n"
            + `    export function path(${parameters.map(param => `${param.name}: ${param.type}`).join(", ")}): string\n`
            + `    {\n`
            + `        return ${path};\n`
            + `    }\n`
            + "}";
    }
}