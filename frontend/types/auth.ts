export interface AuthUser {
  id: number;
  email: string;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SetupStatus {
  needs_setup: boolean;
}

