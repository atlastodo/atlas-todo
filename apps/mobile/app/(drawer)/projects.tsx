import { router } from "expo-router";
import { ProjectsScreen } from "../../src/screens/ProjectsScreen";

/** Projects. The route owns navigation; tapping a project opens it. */
export default function Projects() {
  return <ProjectsScreen onOpenProject={(project) => router.push(`/project/${project.id}`)} />;
}
