export const useQuery = () => new URLSearchParams(location.search).get('role')==='admin'?{appRole:'admin'}:undefined;
