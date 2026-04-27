import Axios from "axios";
import type { AxiosRequestConfig } from "axios";

const axiosInstance = Axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8000",
});

export const customInstance = <T>(config: AxiosRequestConfig) => {
  return axiosInstance(config).then((res) => res.data as T);
};

export default axiosInstance;
