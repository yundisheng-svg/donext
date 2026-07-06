import { getApiPath } from '../config/paths';

let csrfToken: string | null = null;
let tokenPromise: Promise<string> | null = null;

export const getCsrfToken = async (): Promise<string> => {
    if (csrfToken) {
        return csrfToken;
    }

    if (tokenPromise) {
        return tokenPromise;
    }

    tokenPromise = fetch(getApiPath('csrf-token'), {
        credentials: 'include',
    })
        .then((response) => {
            if (!response.ok) {
                throw new Error('Failed to fetch CSRF token');
            }
            return response.json();
        })
        .then((data) => {
            csrfToken = data.csrfToken;
            tokenPromise = null;
            return csrfToken!;
        })
        .catch((error) => {
            tokenPromise = null;
            throw error;
        });

    return tokenPromise;
};

export const clearCsrfToken = (): void => {
    csrfToken = null;
    tokenPromise = null;
};

/**
 * Like fetch(), but attaches the CSRF token and — if the request is rejected
 * with 403 (the cached token went stale, e.g. after the server restarted and
 * the session/CSRF secret changed) — clears the cached token, fetches a fresh
 * one, and retries once. Prevents a stale token from turning every mutation
 * into an "Internal server error" until the user reloads the page.
 */
export const fetchWithCsrfRetry = async (
    url: string,
    options: RequestInit = {}
): Promise<Response> => {
    const method = (options.method || 'GET').toUpperCase();
    const needsCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (!needsCsrf) {
        return fetch(url, options);
    }

    const send = async (): Promise<Response> => {
        const token = await getCsrfToken();
        return fetch(url, {
            ...options,
            headers: {
                ...(options.headers || {}),
                'x-csrf-token': token,
            },
        });
    };

    let response = await send();
    if (response.status === 403) {
        // Cached token is stale — refresh and retry once.
        clearCsrfToken();
        response = await send();
    }
    return response;
};

export const fetchWithCsrf = async (
    url: string,
    options: RequestInit = {}
): Promise<Response> => {
    const needsCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
        options.method?.toUpperCase() || 'GET'
    );

    if (needsCsrf) {
        const token = await getCsrfToken();
        options.headers = {
            ...options.headers,
            'x-csrf-token': token,
        };
    }

    return fetch(url, options);
};
