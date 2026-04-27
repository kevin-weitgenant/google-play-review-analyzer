import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DesignKanban } from "./components/design-kanban";

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DesignKanban />
    </QueryClientProvider>
  );
}

export default App;
