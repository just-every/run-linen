import { createFileRoute } from "@tanstack/react-router";
import { LinenApp } from "../ui/app";
import "../styles/tokens.css";
import "../styles/base.css";
import "../styles/forms.css";
import "../styles/app.css";
export const Route = createFileRoute("/app")({
  component: LinenApp,
  head: () => ({
    meta: [
      { title: "Linen" },
      {
        name: "description",
        content:
          "Ask once, follow your work, and make the decisions that need you.",
      },
    ],
  }),
});
