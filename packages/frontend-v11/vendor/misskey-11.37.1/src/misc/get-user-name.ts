type User = {
	name?: string | null;
	username: string;
};

export default function(user: User): string {
	return user.name || user.username;
}
