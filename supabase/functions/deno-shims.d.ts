declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

declare module 'https://deno.land/*' {
  export const serve: (handler: (request: Request) => Response | Promise<Response>) => void;
}

declare module 'https://esm.sh/*' {
  export const createClient: (...args: unknown[]) => any;
  export type SupabaseClient<
    Database = any,
    SchemaNameOrClientOptions = any,
    SchemaName = any,
  > = any;
}

declare module 'npm:@supabase/supabase-js@2' {
  export const createClient: (...args: unknown[]) => any;
  export type SupabaseClient<
    Database = any,
    SchemaNameOrClientOptions = any,
    SchemaName = any,
  > = any;
}
