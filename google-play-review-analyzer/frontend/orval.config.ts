import { defineConfig } from "orval";

export default defineConfig({
  api: {
    input: {
      target: "http://localhost:8000/openapi.json",
    },
    output: {
      client: "axios",
      target: "./src/api/endpoints.ts",
      schemas: "./src/api/models",
      mode: "tags-split",
      override: {
        mutator: {
          path: "./src/api/axios-instance.ts",
          name: "customInstance",
        },
      },
    },
  },
});
