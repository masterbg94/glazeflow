# please Understand this app:

## Main company

main company and me are owners of this and only we are admins for that app, and only i can login with my superuser admin email/password account... its like superadmin and i can only add other admins for "main company" who own that busines..

main company is company that own that webapp , and me as superadmin.

## Superadmin can:

- add / edit main company admins (and other employees) and see all info about companies , add companies, edit them. When tell superadmin can add companues it mean for smaller companies that will order from us (from bigger company who own platform). So I (superadmin) can add companies its users , and users for main company that own that business.

# review that logic i need to fix:

Flow -> I and other admin (from main project) can change catalogs add products that smaller companies can order from us and sell further to its clients. We are only big company , and we're suppliers for that smaller ones.
When smaller company order something from our catalog we receive order and need to have info about that, to reveive order and put in according status (confirmed, in progress or whichever statuses we had).
When change order status , client who send order is informed back that status is changed.

In bigger company (at our site) , we need to cover multi role access to that order! Thats because we want to have multi roles from admin to production line. Production line worker can only change status to forward (for now) and thats all he can do..

Admin of smaller company - dont know exactly what it can see , but simillar to bigger company, can see orders and statuses, while its workers can order and track statuses and send messages to other people can see.

# Catalog logic:

we as main compoany , as supplier for smaller ones can change catalog and all what we produce!
I as developer need to be as owner of that product , as admin to see catalog, to add / edit companies.
I can adapt catalog if company admin accept.

# Creating user logic:

Me as developer (nmilinkovic46@gmail.com) can add other admins to main app (localhost) and create companues that would be tenans (tenant.localhost) and its users with different roles !

# Superadmin role:

I as developer need to be as owner of that product , as admin to see catalog, to add / edit companies , its employees and roles. And potentially orders ! Thats because of any errors on web app to know what need to fix !! To have some log what happend of error ocours.
I (superadmin) can see full access , because of logs and tracking errors

# Roles in bigger company :

Lower roles cant do some actions. Like example: "production_line_worker" role cant do orders , cant change status to previous. If status go from "received order", "on_hold", "accepted" , "in progress" , "for transport" , then "production_line_worker" cant move from "accepted" to "on_hold" , but manager can.
Manager can move to second status , in that case "on_hold" , but admin can do any !
Every higher role need to approve action from lower role , see example below !

> Example of roles behavior:
> When for example "production_line_worker" want to move status from "in_progress" to "accepted" , he need to write reason , and that can be mover in "accepted" only when "manager" role accept or approve that change. Same for manager roles when want to change "catalog" or prices or any from that admin can do !!
> Manger have options like admin but its admin approved , while production worker (or however we call this role) , have options like manager but need to be approved by manager !!

# Roles in smaller company:

similar to bigger one , but when ordered need to be super admin or admin (owner of platform, website) approved when want to change to one step back!
