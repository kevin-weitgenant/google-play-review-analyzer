import Axios from "axios";

const axiosInstance = Axios.create({
  baseURL: "http://localhost:8000",
});

export const customInstance = <T>(config: Parameters<typeof axiosInstance>[0]) => {
  return axiosInstance(config).then((res) => res.data as T);
};

export default axiosInstance;
