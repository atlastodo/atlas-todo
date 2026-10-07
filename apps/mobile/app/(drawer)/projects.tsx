import { router } from "expo-router";
import { ProjectsScreen } from "../../src/screens/ProjectsScreen";
import { useHeaderRight } from "../../src/ui/useHeaderTitle";

/** Projects. The route owns navigation; tapping a project opens it, as does creating one. */
export default function Projects() {
  const setHeaderRight = useHeaderRight();
  return (
    <ProjectsScreen
      onOpenProject={(project) => router.push(`/project/${project.id}`)}
      onCreated={(id) => router.push(`/project/${id}`)}
      onHeaderActions={setHeaderRight}
    />
  );
}
