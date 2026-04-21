export const repoPath = (repo: string) => `/repos/${repo}`;
export const apiPath = (repo: string, id: string) => `/repos/${repo}/apis/${id}`;
export const workerPath = (repo: string, id: string) =>
  `/repos/${repo}/workers/${id}`;
export const tablePath = (repo: string, id: string) =>
  `/repos/${repo}/tables/${id}`;
export const topicPath = (repo: string, id: string) =>
  `/repos/${repo}/topics/${id}`;
export const integrationPath = (repo: string, id: string) =>
  `/repos/${repo}/integrations/${id}`;
export const middlewarePath = (repo: string, id: string) =>
  `/repos/${repo}/middlewares/${id}`;

export const apisIndexPath = (repo: string) => `/repos/${repo}/apis`;
export const workersIndexPath = (repo: string) => `/repos/${repo}/workers`;
export const tablesIndexPath = (repo: string) => `/repos/${repo}/tables`;
export const topicsIndexPath = (repo: string) => `/repos/${repo}/topics`;
export const integrationsIndexPath = (repo: string) =>
  `/repos/${repo}/integrations`;
export const middlewaresIndexPath = (repo: string) =>
  `/repos/${repo}/middlewares`;
