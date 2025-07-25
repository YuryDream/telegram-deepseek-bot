package db

import (
	"time"
)

type Bot struct {
	ID         int
	Address    string
	CrtFile    string
	CreateTime int64
	UpdateTime int64
	IsDeleted  int
}

func CreateBot(address, crtFile string) error {
	now := time.Now().Unix()
	_, err := DB.Exec(`INSERT INTO bot (address, crt_file, create_time, update_time, is_deleted) VALUES (?, ?, ?, ?, 0)`,
		address, crtFile, now, now)
	return err
}

func GetBotByID(id int) (*Bot, error) {
	row := DB.QueryRow(`SELECT id, address, crt_file, create_time, update_time, is_deleted FROM bot WHERE id = ? AND is_deleted = 0`, id)
	b := &Bot{}
	err := row.Scan(&b.ID, &b.Address, &b.CrtFile, &b.CreateTime, &b.UpdateTime, &b.IsDeleted)
	if err != nil {
		return nil, err
	}
	return b, nil
}

func UpdateBotAddress(id int, newAddress string) error {
	now := time.Now().Unix()
	_, err := DB.Exec(`UPDATE bot SET address = ?, update_time = ? WHERE id = ?`, newAddress, now, id)
	return err
}

func SoftDeleteBot(id int) error {
	_, err := DB.Exec(`UPDATE bot SET is_deleted = 1 WHERE id = ?`, id)
	return err
}

func ListUsers(offset, limit int) ([]User, int, error) {
	rows, err := DB.Query(`SELECT id, username, password, create_time, update_time FROM users LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	
	var users []User
	for rows.Next() {
		var u User
		err := rows.Scan(&u.ID, &u.Username, &u.Password, &u.CreateTime, &u.UpdateTime)
		if err != nil {
			return nil, 0, err
		}
		users = append(users, u)
	}
	
	var total int
	err = DB.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	
	return users, total, nil
}

func ListBots(offset, limit int) ([]Bot, int, error) {
	rows, err := DB.Query(`SELECT id, address, crt_file, create_time, update_time, is_deleted FROM bot WHERE is_deleted = 0 LIMIT ? OFFSET ?`, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	
	var bots []Bot
	for rows.Next() {
		var b Bot
		err := rows.Scan(&b.ID, &b.Address, &b.CrtFile, &b.CreateTime, &b.UpdateTime, &b.IsDeleted)
		if err != nil {
			return nil, 0, err
		}
		bots = append(bots, b)
	}
	
	var total int
	err = DB.QueryRow(`SELECT COUNT(*) FROM bot WHERE is_deleted = 0`).Scan(&total)
	if err != nil {
		return nil, 0, err
	}
	
	return bots, total, nil
}
